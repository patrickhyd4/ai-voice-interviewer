// audio-processor.js
class AudioProcessor extends AudioWorkletProcessor {
  process(inputs, outputs, parameters) {
    const input = inputs[0];
    const output = outputs[0];

    if (!input || input.length === 0) {
      return true; // Keep processor alive
    }

    const inputChannel = input[0];

    // Convert Float32Array to Int16Array for Deepgram
    const buffer = new Int16Array(inputChannel.length);
    for (let i = 0; i < inputChannel.length; i++) {
      buffer[i] = Math.min(1, Math.max(-1, inputChannel[i])) * 0x7FFF;
    }

// Send the processed audio data to the main thread
    console.log('AudioProcessor: Posting message to main thread with buffer size:', buffer.length);
    this.port.postMessage(buffer);

    return true; // Keep processor alive
  }
}

registerProcessor('audio-processor', AudioProcessor);