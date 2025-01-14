import { createSignal, createEffect, onCleanup, onMount, For } from 'solid-js';

const VideoCNN = () => {
  const [dataChannelLog, setDataChannelLog] = createSignal('');
  const [iceConnectionLog, setIceConnectionLog] = createSignal('');
  const [iceGatheringLog, setIceGatheringLog] = createSignal('');
  const [signalingLog, setSignalingLog] = createSignal('');
  const [offerSdp, setOfferSdp] = createSignal('');
  const [answerSdp, setAnswerSdp] = createSignal('');
  const [error, setError] = createSignal(null);
  const [showStart, setShowStart] = createSignal(true);
  const [showStop, setShowStop] = createSignal(false);
  const [showMedia, setShowMedia] = createSignal(false);
  
  // State variables for video devices
  const [videoInputs, setVideoInputs] = createSignal([]);
  const [selectedVideoInput, setSelectedVideoInput] = createSignal('');

  //Close variables
  const [isOpen, setIsOpen] = createSignal(true);

  //Peerconnection, datachannel and interval variable
  let pc = null;
  let dc = null;
  let dcInterval = null;

  const createPeerConnection = () => {
    const config = {
      sdpSemantics: 'unified-plan',
      iceServers: document.getElementById('use-stun').checked
        ? [{ urls: ['stun:stun.l.google.com:19302'] }]
        : [],
    };

    pc = new RTCPeerConnection(config);

    pc.addEventListener('icegatheringstatechange', () => {
      setIceGatheringLog(prev => prev + ' -> ' + pc.iceGatheringState);
    });

    pc.addEventListener('iceconnectionstatechange', () => {
      setIceConnectionLog(prev => prev + ' -> ' + pc.iceConnectionState);
    });

    pc.addEventListener('signalingstatechange', () => {
      setSignalingLog(prev => prev + ' -> ' + pc.signalingState);
    });

    pc.addEventListener('track', (evt) => {
      if (evt.track.kind === 'video') {
        document.getElementById('video').srcObject = evt.streams[0];
      }
    });

    return pc;
  };

  const enumerateVideoDevices = async () => {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const videoInputDevices = devices.filter(device => device.kind === 'videoinput');

      setVideoInputs(videoInputDevices);

      if (videoInputDevices.length > 0) {
        setSelectedVideoInput(videoInputDevices[0].deviceId);
      }
    } catch (err) {
      setError('Failed to get video devices: ' + err.message);
    }
  };

  const negotiate = async () => {
    try {
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      await new Promise((resolve) => {
        if (pc.iceGatheringState === 'complete') {
          resolve();
        } else {
          const checkState = () => {
            if (pc.iceGatheringState === 'complete') {
              pc.removeEventListener('icegatheringstatechange', checkState);
              resolve();
            }
          };
          pc.addEventListener('icegatheringstatechange', checkState);
        }
      });

      const localDesc = pc.localDescription;
      let sdp = localDesc.sdp;

      // const videoCodec = document.getElementById('video-codec').value;
      // if (videoCodec !== 'default') {
      //   sdp = sdpFilterCodec('video', videoCodec, sdp);
      // }

      setOfferSdp(sdp);

      const response = await fetch('/offer', {
        body: JSON.stringify({
          sdp: sdp,
          type: localDesc.type,
        }),
        headers: {
          'Content-Type': 'application/json',
        },
        method: 'POST',
      });

      const answer = await response.json();
      setAnswerSdp(answer.sdp);
      await pc.setRemoteDescription(answer);
    } catch (e) {
      console.error(e);
    }
  };

  const start = async () => {
    setShowStart(false);
    pc = createPeerConnection();

    let timeStart = null;

    const currentStamp = () => {
      if (timeStart === null) {
        timeStart = new Date().getTime();
        return 0;
      } else {
        return new Date().getTime() - timeStart;
      }
    };

    if (document.getElementById('use-datachannel').checked) {
      const parameters = JSON.parse(document.getElementById('datachannel-parameters').value);
      dc = pc.createDataChannel('chat', parameters);

      dc.addEventListener('close', () => {
        clearInterval(dcInterval);
        setDataChannelLog(prev => prev + '- close\n');
      });

      dc.addEventListener('open', () => {
        setDataChannelLog(prev => prev + '- open\n');
        dcInterval = setInterval(() => {
          const message = `ping ${currentStamp()}`;
          setDataChannelLog(prev => prev + `> ${message}\n`);
          dc.send(message);
        }, 1000);
      });

      dc.addEventListener('message', (evt) => {
        setDataChannelLog(prev => prev + `< ${evt.data}\n`);
        if (evt.data.substring(0, 4) === 'pong') {
          const elapsedMs = currentStamp() - parseInt(evt.data.substring(5), 10);
          setDataChannelLog(prev => prev + ` RTT ${elapsedMs} ms\n`);
        }
      });
    }

    const constraints = {
      video: { deviceId: { exact: selectedVideoInput() } }
    };

    // const resolution = document.getElementById('video-resolution').value;
    // if (resolution) {
    //   const [width, height] = resolution.split('x').map(Number);
    //   constraints.video = { ...constraints.video, width, height };
    // }

    try {
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      stream.getTracks().forEach(track => {
        pc.addTrack(track, stream);
      });
      setShowMedia(true);
      await negotiate();
    } catch (err) {
      console.error('Could not acquire media:', err);
    }

    setShowStop(true);
  };

  const stop = () => {
    setShowStop(false);

    if (dc) {
      dc.close();
    }

    if (pc.getTransceivers) {
      pc.getTransceivers().forEach(transceiver => {
        if (transceiver.stop) {
          transceiver.stop();
        }
      });
    }

    pc.getSenders().forEach(sender => {
      sender.track.stop();
    });

    setTimeout(() => {
      pc.close();
    }, 500);
  };

  const sdpFilterCodec = (kind, codec, realSdp) => {
    var allowed = []
    var rtxRegex = new RegExp('a=fmtp:(\\d+) apt=(\\d+)\r$');
    var codecRegex = new RegExp('a=rtpmap:([0-9]+) ' + escapeRegExp(codec))
    var videoRegex = new RegExp('(m=' + kind + ' .*?)( ([0-9]+))*\\s*$')

    var lines = realSdp.split('\n');

    var isKind = false;
    for (var i = 0; i < lines.length; i++) {
        if (lines[i].startsWith('m=' + kind + ' ')) {
            isKind = true;
        } else if (lines[i].startsWith('m=')) {
            isKind = false;
        }

        if (isKind) {
            var match = lines[i].match(codecRegex);
            if (match) {
                allowed.push(parseInt(match[1]));
            }

            match = lines[i].match(rtxRegex);
            if (match && allowed.includes(parseInt(match[2]))) {
                allowed.push(parseInt(match[1]));
            }
        }
    }
  };

  onMount(() => {
    enumerateVideoDevices();
  });

  onCleanup(() => {
    if (dc) {
      dc.close();
    }
    if (pc) {
      pc.close();
    }
  });

  return (
    <div class="text-white p-4">
      <h2 class="text-2xl font-bold mb-4">Video WebRTC</h2>
      {error() && (
        <div class="bg-red-900 border border-white-900 text-white px-4 py-3 rounded mb-4" role="alert">
          <p>{error()}</p>
        </div>
      )}
      <div class="mb-4">
        <h3 class="text-xl font-semibold mb-2">Settings:</h3>
        <div class='border border-black shadow-md mx-auto flex flex-col px-2 gap-2'>
          <button 
            class='self-end text-gray-500 hover:text-gray-700'
            onClick={() => setIsOpen(!isOpen())}
          >
            {isOpen() ? '▼ Close' : '▶ Open'}
          </button>
          {isOpen() && (
            <>
              <label for="use-datachannel" class="flex items-center">
                <input type='checkbox' id='use-datachannel' class="mr-2" />
                Use Datachannel?
              </label>
              <select id="datachannel-parameters" class="text-black p-2 border rounded">
                <option value='{"ordered": true}'>Ordered, reliable</option>
                <option value='{"ordered": false, "maxRetransmits": 0}'>Unordered, no retransmissions</option>
                <option value='{"ordered": false, "maxPacketLifetime": 500}'>Unordered, 500ms lifetime</option>
              </select>
              <select id="video-codec" class="text-black p-2 border rounded">
                <option value="default" selected>Default codecs</option>
                <option value="VP8/90000">VP8</option>
                <option value="H264/90000">H264</option>
              </select>
              <select id="video-resolution" class="text-black p-2 border rounded">
                <option value="" selected>Default resolution</option>
                <option value="320x240">320x240</option>
                <option value="640x480">640x480</option>
                <option value="960x540">960x540</option>
                <option value="1280x720">1280x720</option>
              </select>
              <label for="use-stun" class="flex items-center">
                <input type='checkbox' id='use-stun' class="mr-2" />
                Use STUN?
              </label>
            </>
          )}
        </div>
        <h3 class="text-xl font-semibold mt-4 mb-2">Video Devices</h3>
        <div>
          <label for="video-input" class="mr-2">Video Input:</label>
          <select
            id="video-input"
            value={selectedVideoInput()}
            onChange={(e) => setSelectedVideoInput(e.target.value)}
            class="text-black p-2 border rounded"
          >
            <For each={videoInputs()}>
              {(device) => (
                <option value={device.deviceId}>
                  {device.label || `Video Device ${device.deviceId.substr(0, 5)}`}
                </option>
              )}
            </For>
          </select>
        </div>
      </div>
      <div class="mb-4">
        <button onClick={start} class="bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded mr-2" style={{ display: showStart() ? 'inline-block' : 'none' }}>Start</button>
        <button onClick={stop} class="bg-red-500 hover:bg-red-700 text-white font-bold py-2 px-4 rounded" style={{ display: showStop() ? 'inline-block' : 'none' }}>Stop</button>
      </div>
      <h3 class="text-xl font-semibold mb-2">Data Channel</h3>
      <pre id="data-channel" class="bg-gray-700 p-2 rounded">Loaded when connection made<br/>{dataChannelLog()}</pre>
      <h3 class="text-xl font-semibold mb-2">ICE Connection State</h3>
      <p id="ice-connection-state">{iceConnectionLog()}</p>
      <h3 class="text-xl font-semibold mb-2">ICE Gathering State</h3>
      <p id="ice-gathering-state">{iceGatheringLog()}</p>
      <h3 class="text-xl font-semibold mb-2">Signaling State</h3>
      <p id="signaling-state">{signalingLog()}</p>
      <h3 class="text-xl font-semibold mb-2">SDP Offer</h3>
      <pre id="offer-sdp" class="bg-gray-700 p-2 rounded overflow-auto max-h-40">Loaded when connection made<br/>{offerSdp()}</pre>
      <h3 class="text-xl font-semibold mb-2">SDP Answer</h3>
      <pre id="answer-sdp" class="bg-gray-700 p-2 rounded overflow-auto max-h-40">Loaded when connection made<br/>{answerSdp()}</pre>
      <div id="media" style={{ display: showMedia() ? 'block' : 'none' }}>
        <h3 class="text-xl font-semibold mb-2">Media</h3>
        <video id="video" autoplay playsinline class="w-full max-w-lg mx-auto"></video>
      </div>
    </div>
  );
  
};

export default VideoCNN;