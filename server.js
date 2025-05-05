const WebSocket = require('ws');
const OpenAI = require('openai'); // Import OpenAI library
require('dotenv').config(); // Load environment variables from .env file

const wss = new WebSocket.Server({ port: 8080 });

// Initialize OpenAI client
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

wss.on('listening', () => {
  console.log('WebSocket server listening on port 8080');
});

wss.on('connection', function connection(ws) {
  console.log('Client connected');

  const deepgramApiKey = process.env.DEEPGRAM_API_KEY;
  if (!deepgramApiKey) {
    console.error('Deepgram API key not found. Please set the DEEPGRAM_API_KEY environment variable.');
    ws.send(JSON.stringify({ type: 'error', message: 'Server error: Deepgram API key not configured.' }));
    ws.close(1011, 'Server error');
    return;
  }

  let deepgramSttWs = null;
  let deepgramSttReady = false;
  const audioBuffer = [];

  console.log('Attempting to connect to Deepgram STT WebSocket...');
  // Establish connection to Deepgram API for STT
  deepgramSttWs = new WebSocket('wss://api.deepgram.com/v1/listen?encoding=linear16&sample_rate=16000&model=nova-2&smart_format=true&interim_results=true&utterance_end_ms=1000&endpointing=true&no_delay=true', {
    headers: {
      'Authorization': `Token ${deepgramApiKey}`
    }
  });

  deepgramSttWs.on('open', () => {
    console.log('Deepgram STT connection opened successfully!');
    deepgramSttReady = true;
    // Send any buffered audio data
    while (audioBuffer.length > 0) {
      const bufferedAudio = audioBuffer.shift();
      deepgramSttWs.send(bufferedAudio);
    }
  });

  deepgramSttWs.on('message', async (data) => {
    const result = JSON.parse(data);
    // console.log('Deepgram STT message received:', JSON.stringify(result, null, 2)); // Suppress frequent logs

    if (result.type === 'Results' && result.channel && result.channel.alternatives && result.channel.alternatives.length > 0) {
      const transcript = result.channel.alternatives[0].transcript;
      if (transcript) {
        // Send transcript to the frontend
        ws.send(JSON.stringify({ type: 'transcript', text: transcript, is_final: result.is_final }));

        if (result.is_final) {
          console.log('Final transcript from Deepgram STT:', transcript);
          // Process the final transcript with OpenAI
          try {
            console.log('Sending transcript to OpenAI...');
            const aiResponse = await openai.chat.completions.create({
              model: 'gpt-4o-mini', // Use the model from config or environment
              messages: [{ role: 'user', content: transcript }], // Use conversation history here later
              max_tokens: 150,
              temperature: 0.7,
            });

            const aiResponseText = aiResponse.choices[0]?.message?.content;
            if (aiResponseText) {
              console.log('AI response received:', aiResponseText);
              // Send AI response text to the frontend
              ws.send(JSON.stringify({ type: 'aiResponse', text: aiResponseText }));

              // Send AI response text to Deepgram TTS
              console.log('Sending AI response to Deepgram TTS...');
              const deepgramTtsUrl = 'https://api.deepgram.com/v1/speak?model=Thalia'; // Use voice model from config or environment
              const ttsResponse = await fetch(deepgramTtsUrl, {
                method: 'POST',
                headers: {
                  'Authorization': `Token ${deepgramApiKey}`,
                  'Content-Type': 'application/json'
                },
                body: JSON.stringify({ text: aiResponseText })
              });

              if (!ttsResponse.ok) {
                throw new Error(`Deepgram TTS error: ${ttsResponse.statusText}`);
              }

              const audioBuffer = await ttsResponse.arrayBuffer();
              console.log('Audio data received from Deepgram TTS.');
              // Send audio data to the frontend
              ws.send(JSON.stringify({ type: 'audio', audio: Buffer.from(audioBuffer).toString('base64') })); // Send audio as base64 string

            } else {
              console.warn('OpenAI did not return a valid response.');
              ws.send(JSON.stringify({ type: 'error', message: 'AI did not return a valid response.' }));
            }

          } catch (error) {
            console.error('Error processing transcript with OpenAI or Deepgram TTS:', error);
            ws.send(JSON.stringify({ type: 'error', message: `Server error processing AI or TTS: ${error.message}` }));
          }
        }
      }
    } else if (result.type === 'Error') {
        console.error('Deepgram STT Error Message:', result);
        ws.send(JSON.stringify({ type: 'error', message: `Deepgram STT error: ${result.message || 'Unknown error'}` }));
    }
  });

  deepgramSttWs.on('close', (code, reason) => {
    console.log(`Deepgram STT connection closed with code ${code} and reason: ${reason}`);
    deepgramSttReady = false;
    // Close frontend connection if Deepgram connection closes
    ws.close(code, reason);
  });

  deepgramSttWs.on('error', (err) => {
    console.error('Deepgram STT WebSocket error event:', err);
    console.error('Deepgram STT WebSocket error details:', err);
    deepgramSttReady = false;
    // Forward error to frontend client and close connection
    ws.send(JSON.stringify({ type: 'error', message: `Deepgram STT error: ${err.message}` }));
    ws.close(1011, 'Deepgram STT error');
  });

  ws.on('message', function incoming(message) {
    console.log('Message received from frontend WebSocket.');
    // Handle messages from the frontend client
    if (typeof message === 'string') {
        try {
            const data = JSON.parse(message);
            if (data.type === 'userSpeech') {
                console.log('Received user speech (JSON) from frontend:', data.text);
                // This case is now handled by Deepgram STT results, so this block might be redundant
                // depending on the desired flow. If frontend sends final transcript directly,
                // process it here. Otherwise, rely on Deepgram's final results.
            } else {
                console.log('Received unknown JSON message type from frontend:', data.type);
            }
        } catch (e) {
            console.error('Failed to parse message from frontend as JSON:', e);
            // If not JSON, assume it's raw audio data
            console.log('Received potential binary audio data from frontend.');
            console.log('Deepgram STT WebSocket readyState:', deepgramSttWs.readyState);
            if (deepgramSttReady) { // Use the ready flag
                console.log('Forwarding audio data to Deepgram STT.');
                deepgramSttWs.send(message); // Forward raw audio to Deepgram STT
            } else {
                console.warn('Deepgram STT WebSocket not ready, buffering audio message.');
                audioBuffer.push(message); // Buffer audio data
            }
        }
    } else {
        // Assume binary message is audio data
        console.log('Received binary audio data from frontend.');
        console.log('Deepgram STT WebSocket readyState:', deepgramSttWs.readyState);
        if (deepgramSttReady) { // Use the ready flag
            console.log('Forwarding binary audio data to Deepgram STT.');
            deepgramSttWs.send(message); // Forward raw audio to Deepgram STT
        } else {
            console.warn('Deepgram STT WebSocket not ready, buffering binary message.');
            audioBuffer.push(message); // Buffer audio data
        }
    }
  });

  ws.on('close', function close(code, reason) {
    console.log(`Client disconnected with code ${code} and reason: ${reason}`);
    // Close Deepgram connection if frontend client disconnects
    if (deepgramSttWs && deepgramSttWs.readyState === WebSocket.OPEN) {
      deepgramSttWs.close(); // Close without code and reason
    }
  });

  ws.on('error', function error(err) {
    console.error('WebSocket error:', err);
    // Close Deepgram connection if frontend client has an error
    if (deepgramSttWs && deepgramSttWs.readyState === WebSocket.OPEN) {
      deepgramSttWs.close(); // Close without code and reason
    }
  });

  console.log('Frontend client connected, attempting to connect to Deepgram STT...');
});

console.log('Starting WebSocket server...');