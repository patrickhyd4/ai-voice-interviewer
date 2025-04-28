// Placeholder for Deepgram integration and AI logic

document.addEventListener('DOMContentLoaded', () => {
    const endConversationButton = document.querySelector('.end-conversation-button');
    const chatArea = document.querySelector('.chat-area');

    // Function to add a message to the chat area
    function addMessage(text, sender = 'user') {
        const messageDiv = document.createElement('div');
        messageDiv.classList.add('message', sender);

        const avatarDiv = document.createElement('div');
        avatarDiv.classList.add('avatar');
        messageDiv.appendChild(avatarDiv);

        const textDiv = document.createElement('div');
        textDiv.classList.add('text');
        textDiv.textContent = text;
        messageDiv.appendChild(textDiv);

        chatArea.appendChild(messageDiv);
        chatArea.scrollTop = chatArea.scrollHeight; // Auto-scroll to the latest message
    }

    // --- Deepgram Integration ---
    // IMPORTANT: Replace 'YOUR_DEEPGRAM_API_KEY' with your actual Deepgram API key
    const deepgramApiKey = 'cc57793d3e8477c84529db199e77be9b0508dfab';
    let deepgramSocket;
    let microphone;
    let microphoneStream;

async function startConversation() {
        console.log('Attempting to start conversation...');
        try {
            console.log('Requesting microphone access...');
            microphoneStream = await navigator.mediaDevices.getUserMedia({ audio: true });
            console.log('Microphone access granted.');
            const audioContext = new AudioContext();
const source = audioContext.createMediaStreamSource(microphoneStream);

            console.log('Loading audio-processor.js AudioWorklet module...');
            await audioContext.audioWorklet.addModule('audio-processor.js');
            console.log('AudioWorklet module loaded.');
            console.log('Creating AudioWorkletNode...');
            const audioWorkletNode = new AudioWorkletNode(audioContext, 'audio-processor');
            console.log('AudioWorkletNode created.');

source.connect(audioWorkletNode);
            console.log('Source connected to AudioWorkletNode.');
            audioWorkletNode.connect(audioContext.destination);
            console.log('AudioWorkletNode connected to destination.');

            // Listen for messages from the AudioWorklet
            audioWorkletNode.port.onmessage = (event) => {
                console.log('Message received from AudioWorklet:', event.data);
                if (deepgramSocket && deepgramSocket.readyState === WebSocket.OPEN) {
                    console.log('Sending audio data to Deepgram WebSocket.');
                    deepgramSocket.send(event.data);
                } else {
                    console.warn('Deepgram WebSocket not open, cannot send audio data.');
                }
            };

// Establish WebSocket connection to Deepgram
            console.log('Attempting to connect to Deepgram WebSocket...');
            deepgramSocket = new WebSocket(`wss://api.deepgram.com/v1/listen?model=interview&smart_format=true&interim_results=true`, ['token', deepgramApiKey]);

            deepgramSocket.onopen = () => {
                console.log('Deepgram connection opened successfully!');
                // You might want to indicate to the user that they can start speaking
            };

deepgramSocket.onmessage = async (event) => {
                console.log('Raw Deepgram message event received:', event);
                const data = JSON.parse(event.data);
                console.log('Parsed Deepgram message data:', data);

                if (data.channel && data.channel.alternatives && data.channel.alternatives.length > 0) {
                    const transcript = data.channel.alternatives[0].transcript;
                    if (transcript && data.is_final) { // Process only final transcripts
                        console.log('Final Transcript received:', transcript);
                        addMessage(transcript, 'user'); // Display user's final transcript

                        console.log('Sending final transcript to AI model...');

// Send transcript to AI model and handle response
                        const aiResponseText = await getAiResponse(transcript);
                        console.log('AI response received:', aiResponseText);
                        addMessage(aiResponseText, 'ai'); // Display AI's response
                        console.log('Playing AI response as speech...');
                        playTextAsSpeech(aiResponseText); // Play AI's response as speech
                    } else if (transcript && data.is_final === false) {
                         console.log('Interim Transcript:', transcript);
                         // Optionally display interim results
                         // addMessage(transcript, 'user-interim');
                    }
                } else {
                    console.log('Deepgram message does not contain transcript data.');
                }
            };

deepgramSocket.onerror = (error) => {
                console.error('Deepgram WebSocket error:', error);
            };

            deepgramSocket.onclose = (event) => {
                console.log('Deepgram connection closed.', event);
            };

} catch (error) {
            console.error('Caught error in startConversation:', error);
            alert('Could not access microphone or connect to Deepgram. Please check console for details.');
        }
    }

function stopConversation() {
        console.log('Attempting to stop conversation...');
        if (deepgramSocket) {
            console.log('Closing Deepgram WebSocket...');
            deepgramSocket.close();
        } else {
            console.log('Deepgram WebSocket not active.');
        }
        if (microphoneStream) {
            console.log('Stopping microphone tracks...');
            microphoneStream.getTracks().forEach(track => track.stop());
            console.log('Microphone tracks stopped.');
        } else {
            console.log('Microphone stream not active.');
        }
        console.log("Conversation ended.");
        // You might want to indicate to the user that the conversation has ended
    }

    endConversationButton.addEventListener('click', () => {
        stopConversation();
    });

    // --- AI Interviewer Logic (OpenAI Integration) ---
async function getAiResponse(userSpeech) {
        console.log("Attempting to get AI response for:", userSpeech);
        const openaiApiKey = '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'; // Replace with your actual OpenAI API key
        const messages = [
            { role: "system", content: "You are an interviewer conducting a job interview. Ask relevant questions based on the candidate's responses. Keep your responses concise and professional." },
            { role: "user", content: userSpeech }
        ];

        console.log("Fetching OpenAI API...");

        try {
            const response = await fetch('https://api.openai.com/v1/chat/completions', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${openaiApiKey}`
                },
                body: JSON.stringify({
                    model: 'gpt-4o-mini', // Or another suitable OpenAI model
                    messages: messages,
                    max_tokens: 150, // Limit response length
                    temperature: 0.7 // Adjust for creativity vs. predictability
                })
            });

            if (!response.ok) {
                const error = await response.json();
                throw new Error(`OpenAI API error: ${response.statusText} - ${error.message}`);
            }

            const data = await response.json();
            if (data.choices && data.choices.length > 0 && data.choices[0].message) {
                return data.choices[0].message.content;
            } else {
                return "I did not receive a valid response from the AI.";
            }

} catch (error) {
            console.error('Caught error getting AI response:', error);
            return "Sorry, I am having trouble connecting to the AI at the moment.";
        }
    }

    // --- Deepgram Text-to-Speech (TTS) Integration ---
async function playTextAsSpeech(text) {
        console.log("Attempting to play AI response as speech:", text);
        try {
            console.log("Fetching Deepgram TTS API...");
            const response = await fetch('https://api.deepgram.com/v1/speak?model=aura-angus-en', { // Using a placeholder voice model
                method: 'POST',
                headers: {
                    'Authorization': `Token ${deepgramApiKey}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ text: text })
            });

            if (!response.ok) {
                throw new Error(`Deepgram TTS error: ${response.statusText}`);
            }

            const audioBlob = await response.blob();
            const audioUrl = URL.createObjectURL(audioBlob);
            const audio = new Audio(audioUrl);
            audio.play();

            audio.onended = () => {
                URL.revokeObjectURL(audioUrl); // Clean up the object URL after playback
            };

} catch (error) {
            console.error('Caught error playing text as speech:', error);
        }
    }

    // Initial message display (matching the screenshot)
    // This is a static display for now, dynamic handling will be needed
    // once the voice agent is fully implemented.
    const initialMessageDiv = document.createElement('div');
    initialMessageDiv.classList.add('message', 'user'); // Assuming the first message is from the 'user' based on the screenshot layout

    const initialAvatarDiv = document.createElement('div');
    initialAvatarDiv.classList.add('avatar');
     // Specific styling for the first message avatar based on CSS
    initialAvatarDiv.style.backgroundColor = 'transparent';
    initialAvatarDiv.style.border = '1px solid #ffffff';
    initialAvatarDiv.style.width = '20px';
    initialAvatarDiv.style.height = '20px';
    initialAvatarDiv.style.marginTop = '5px';

    const initialTextDiv = document.createElement('div');
    initialTextDiv.classList.add('text');
    initialTextDiv.textContent = "Hello, how can I help you?";
     // Specific styling for the first message text based on CSS
    initialTextDiv.style.backgroundColor = '#3a3a3a';
    initialTextDiv.style.borderRadius = '20px';
    initialTextDiv.style.padding = '8px 15px';


    initialMessageDiv.appendChild(initialAvatarDiv);
    initialMessageDiv.appendChild(initialTextDiv);
    chatArea.appendChild(initialMessageDiv);

    // Automatically start the conversation when the page loads
    startConversation();

});