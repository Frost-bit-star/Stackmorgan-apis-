const express = require('express');
const bodyParser = require('body-parser');
const multer = require('multer');
const fs = require('fs');
const acrcloud = require('acrcloud');
const yts = require('yt-search');
const ytdl = require('ytdl-core');
const axios = require('axios');
const fetch = require('node-fetch');
const PaxSenixAI = require('@paxsenix/ai');

const app = express();
const port = process.env.PORT || 3000;

app.use(bodyParser.json());

const paxsenix = new PaxSenixAI();

// ========== In-Memory Chat Memory ==========
const chatMemory = {};
const SYSTEM_PROMPT = {
  role: 'system',
  content: `You are the stackmorgan Ma AI Assistant. Only users with any questions and reply professional and. Politely decline unrelated questions.`
};

// ========== Troverstar AI Chat ==========
app.post('/chat', async (req, res) => {
  const { userId, message, model } = req.body;
  if (!userId || !message) {
    return res.status(400).json({ error: 'Missing userId or message' });
  }

  if (!chatMemory[userId]) {
    chatMemory[userId] = [SYSTEM_PROMPT];
  }

  chatMemory[userId].push({ role: 'user', content: message });

  try {
    const response = await paxsenix.Chat.createCompletion({
      model: model || 'gpt-3.5-turbo',
      messages: chatMemory[userId]
    });

    const reply = response.choices[0].message;
    chatMemory[userId].push(reply);
    res.json({ response: reply });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Something went wrong with stackmorgan AI' });
  }
});

// ========== Download Video ==========
app.post('/download-video', async (req, res) => {
  const { url } = req.body;
  if (!url) return res.status(400).json({ success: false, message: "Provide a video link." });

  try {
    const response = await fetch(`https://api.dreaded.site/api/alldl?url=${encodeURIComponent(url)}`);
    const data = await response.json();

    if (!data || data.status !== 200 || !data.data?.videoUrl) {
      return res.status(500).json({ success: false, message: "API failed to respond correctly." });
    }

    res.json({
      success: true,
      ...data.data,
      source: url,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: "Internal error.", error: error.message });
  }
});

// ========== Identify Song ==========
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
    const searchQuery = `${music.title} ${music.artists?.map(a => a.name).join(', ')}`;
    const ytResult = await yts(searchQuery);
    const video = ytResult.videos[0];

    const audioDownload = ytdl.filterFormats(await ytdl.getInfo(video.url), 'audioonly')[0]?.url;
    const videoDownload = ytdl.filterFormats(await ytdl.getInfo(video.url), 'videoandaudio')[0]?.url;

    res.json({
      success: true,
      result: {
        title: music.title,
        artist: music.artists?.map(a => a.name).join(', '),
        album: music.album?.name,
        release_date: music.release_date,
        youtube: {
          title: video.title,
          url: video.url,
          mp3: audioDownload,
          mp4: videoDownload,
        }
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: "Error identifying song.", error: error.message });
  }
});

// ========== Download Spotify Song ==========
app.post('/download-song', async (req, res) => {
  const { title } = req.body;
  if (!title) {
    return res.status(400).json({ success: false, message: "Missing title." });
  }

  try {
    const response = await axios.get(`https://api.dreaded.site/api/spotifydl?title=${encodeURIComponent(title)}`);
    const data = response.data;

    if (!data.success) return res.status(404).json({ success: false, message: "Song not found." });

    res.status(200).json({
      success: true,
      title: data.result.title,
      audio_url: data.result.downloadLink,
      message: "Download link retrieved.",
    });
  } catch (error) {
    res.status(500).json({ success: false, message: "Error fetching download link.", error: error.message });
  }
});

// ========== Bundesliga Standings ==========
app.get('/bundesliga-standings', async (req, res) => {
  try {
    const data = await fetch('https://api.dreaded.site/api/standings/BL1').then(res => res.json());

    if (!data || !data.data) {
      return res.status(500).json({ success: false, message: 'Failed to fetch standings' });
    }

    const standings = data.data;
    const table = standings.map((team, i) => `${i + 1}. ${team.team} - ${team.points} pts`).join('\n');

    const message = `🏆 BUNDESLIGA TABLE STANDINGS\n\n${table}`;
    res.status(200).json({ success: true, message });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Something went wrong. Unable to fetch Bundesliga standings.', error: error.message });
  }
});

// ========== Health Check ==========
app.get('/', (req, res) => {
  res.send('🟢 Troverstar API Server is running.');
});

app.listen(port, () => {
  console.log(`✅ Server running at http://localhost:${port}`);
});