const express = require('express');
const bodyParser = require('body-parser');
const multer = require('multer');
const fs = require('fs');
const { exec } = require('child_process');
const acrcloud = require('acrcloud');
const yts = require('yt-search');
const ytdl = require('ytdl-core');
const PaxSenixAI = require('@paxsenix/ai');

const app = express();
const port = process.env.PORT || 3000;

app.use(bodyParser.json());

const paxsenix = new PaxSenixAI();

// ========== Troverstar AI Chat ==========
app.post('/chat', async (req, res) => {
  const { message, model } = req.body;
  if (!message) return res.status(400).json({ error: 'Missing message.' });

  try {
    const response = await paxsenix.Chat.createCompletion({
      model: model || 'gpt-3.5-turbo',
      messages: [
        {
          role: 'system',
          content: `You are the StackMorgan MA AI Assistant. Answer questions about StackMorgan services only. Respond professionally. Politely decline unrelated queries.`
        },
        { role: 'user', content: message }
      ]
    });

    res.json({ response: response.choices[0].message });
  } catch (error) {
    console.error('AI error:', error.response?.data || error.message);
    res.status(500).json({ error: 'StackMorgan AI error.' });
  }
});

// ========== Download YouTube Video (yt-dlp) ==========
app.post('/download-video', async (req, res) => {
  const { url } = req.body;
  if (!url) return res.status(400).json({ success: false, message: "Provide a video URL." });

  try {
    exec(`yt-dlp -f bestaudio --get-url "${url}"`, (err, stdout, stderr) => {
      if (err || stderr) {
        return res.status(500).json({ success: false, message: "Download failed.", error: stderr || err.message });
      }
      res.json({ success: true, audio_url: stdout.trim() });
    });
  } catch (error) {
    res.status(500).json({ success: false, message: "Internal error.", error: error.message });
  }
});

// ========== Identify Song + Download ==========
const upload = multer({ dest: 'uploads/' });
const acr = new acrcloud({
  host: 'identify-ap-southeast-1.acrcloud.com',
  access_key: '26afd4eec96b0f5e5ab16a7e6e05ab37',
  access_secret: 'wXOZIqdMNZmaHJP1YDWVyeQLg579uK2CfY6hWMN8',
});

app.post('/identify-song', upload.single('audio'), async (req, res) => {
  try {
    const buffer = fs.readFileSync(req.file.path);
    const { status, metadata } = await acr.identify(buffer);
    fs.unlinkSync(req.file.path);

    if (status.code !== 0) return res.status(400).json({ success: false, message: status.msg });

    const music = metadata.music[0];
    const query = `${music.title} ${music.artists?.map(a => a.name).join(' ')}`;
    const ytResult = await yts(query);
    const video = ytResult.videos[0];

    const audioDownload = ytdl.filterFormats(await ytdl.getInfo(video.url), 'audioonly')[0]?.url;

    res.json({
      success: true,
      result: {
        title: music.title,
        artist: music.artists?.map(a => a.name).join(', '),
        youtube: {
          title: video.title,
          url: video.url,
          audio: audioDownload,
        }
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: "Error identifying song.", error: error.message });
  }
});

// ========== Health Check ==========
app.get('/', (req, res) => {
  res.send('🟢 Troverstar API is live.');
});

app.listen(port, () => {
  console.log(`✅ Server running at http://localhost:${port}`);
});