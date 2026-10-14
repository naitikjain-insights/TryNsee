
const video = document.getElementById("camera-video");
const canvas = document.getElementById("glasses-canvas");
const ctx = canvas.getContext("2d");

const startButton = document.getElementById("start-camera");
const stopButton = document.getElementById("stop-camera");
const snapshotButton = document.getElementById("take-snapshot");
const statusText = document.getElementById("camera-status");
const placeholder = document.getElementById("camera-placeholder");
const liveLabel = document.getElementById("live-label");
const liveIndicator = document.querySelector(".live-indicator");
const frameLabel = document.getElementById("camera-overlay-label");

document.getElementById("year").textContent = new Date().getFullYear();

const frames = {
  classic: { name: "THE CLASSIC", color: "#20201c", width: 0.23, style: "rect" },
  round:   { name: "THE ROUND", color: "#51483c", width: 0.22, style: "round" },
  aviator: { name: "THE AVIATOR", color: "#b49a5c", width: 0.24, style: "aviator" },
  crystal: { name: "THE CRYSTAL", color: "#c0ad92", width: 0.23, style: "rect" }
};

let selectedFrame = "classic";
let stream = null;
let faceLandmarker = null;
let animationId = null;
let running = false;
let lastVideoTime = -1;
let initializing = false;

function setStatus(message) {
  statusText.textContent = message;
}

function selectFrame(frameName) {
  if (!frames[frameName]) return;
  selectedFrame = frameName;

  document.querySelectorAll("[data-frame]").forEach((button) => {
    const active = button.dataset.frame === frameName;
    button.classList.toggle("active", active);
    button.setAttribute("aria-pressed", String(active));
  });

  document.querySelectorAll("[data-select-frame]").forEach((button) => {
    button.style.borderColor =
      button.dataset.selectFrame === frameName ? "#8f8878" : "";
  });

  const index = Object.keys(frames).indexOf(frameName) + 1;
  frameLabel.textContent = `${frames[frameName].name} / 0${index}`;
}

document.querySelectorAll("[data-frame]").forEach((button) => {
  button.addEventListener("click", () => selectFrame(button.dataset.frame));
});

document.querySelectorAll("[data-select-frame]").forEach((button) => {
  button.addEventListener("click", () => {
    selectFrame(button.dataset.selectFrame);
    document.getElementById("try-on").scrollIntoView({ behavior: "smooth" });
  });
});

async function loadFaceLandmarker() {
  if (faceLandmarker) return faceLandmarker;

  setStatus("Preparing your virtual fitting room…");

  const visionModule = await import(
    "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14"
  );

  const { FaceLandmarker, FilesetResolver } = visionModule;

  const vision = await FilesetResolver.forVisionTasks(
    "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm"
  );

  const options = {
    baseOptions: {
      modelAssetPath:
        "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task",
      delegate: "GPU"
    },
    runningMode: "VIDEO",
    numFaces: 1
  };

  try {
    faceLandmarker = await FaceLandmarker.createFromOptions(vision, options);
  } catch (gpuError) {
    faceLandmarker = await FaceLandmarker.createFromOptions(vision, {
      ...options,
      baseOptions: {
        modelAssetPath: options.baseOptions.modelAssetPath,
        delegate: "CPU"
      }
    });
  }

  return faceLandmarker;
}

async function startCamera() {
  if (running || initializing) return;
  initializing = true;
  startButton.disabled = true;

  try {
    if (!navigator.mediaDevices?.getUserMedia) {
      throw new Error("Camera access requires HTTPS or localhost in a supported browser.");
    }

    setStatus("Requesting camera permission…");

    stream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: {
        facingMode: "user",
        width: { ideal: 1280 },
        height: { ideal: 720 }
      }
    });

    video.srcObject = stream;
    await video.play();
    await loadFaceLandmarker();

    canvas.width = video.videoWidth || 640;
    canvas.height = video.videoHeight || 480;

    video.style.display = "block";
    canvas.style.display = "block";
    placeholder.style.display = "none";

    running = true;
    lastVideoTime = -1;
    stopButton.disabled = false;
    snapshotButton.disabled = false;
    liveLabel.textContent = "LIVE";
    liveIndicator.classList.add("is-live");

    setStatus("Look toward the camera. Choose a frame to try it on.");
    renderFrame();
  } catch (error) {
    stopCamera(false);

    let message = error.message || "Unable to start the camera.";
    if (error.name === "NotAllowedError") {
      message = "Camera permission was denied. Allow camera access in your browser settings and try again.";
    } else if (error.name === "NotFoundError") {
      message = "No camera was found. Connect a camera and try again.";
    } else if (error.name === "NotReadableError") {
      message = "The camera may be in use by another app. Close it and try again.";
    }

    setStatus(message);
  } finally {
    initializing = false;
    startButton.disabled = running;
  }
}

function stopCamera(updateStatus = true) {
  running = false;

  if (animationId !== null) {
    cancelAnimationFrame(animationId);
    animationId = null;
  }

  if (stream) {
    stream.getTracks().forEach((track) => track.stop());
    stream = null;
  }

  video.pause();
  video.srcObject = null;
  video.style.display = "none";
  canvas.style.display = "none";
  placeholder.style.display = "block";
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  stopButton.disabled = true;
  snapshotButton.disabled = true;
  startButton.disabled = false;
  liveLabel.textContent = "STANDBY";
  liveIndicator.classList.remove("is-live");

  if (updateStatus) setStatus("Camera stopped. Your fitting room is ready again.");
}

function point(landmarks, index) {
  const p = landmarks[index];
  return { x: p.x * canvas.width, y: p.y * canvas.height };
}

function drawGlasses(landmarks) {
  // MediaPipe eye landmarks: outer and inner corners of both eyes.
  const leftOuter = point(landmarks, 33);
  const leftInner = point(landmarks, 133);
  const rightInner = point(landmarks, 362);
  const rightOuter = point(landmarks, 263);
  const bridge = point(landmarks, 168);

  const leftCenter = {
    x: (leftOuter.x + leftInner.x) / 2,
    y: (leftOuter.y + leftInner.y) / 2
  };
  const rightCenter = {
    x: (rightOuter.x + rightInner.x) / 2,
    y: (rightOuter.y + rightInner.y) / 2
  };

  const eyeDistance = Math.hypot(
    rightCenter.x - leftCenter.x,
    rightCenter.y - leftCenter.y
  );

  if (!Number.isFinite(eyeDistance) || eyeDistance < 10) return;

  const frame = frames[selectedFrame];
  const angle = Math.atan2(
    rightCenter.y - leftCenter.y,
    rightCenter.x - leftCenter.x
  );

  const lensWidth = eyeDistance * frame.width;
  const lensHeight = lensWidth * 0.69;
  const strokeWidth = Math.max(2, canvas.width * 0.0027);

  ctx.save();

  // The video is mirrored in CSS; mirror the overlay to match it.
  ctx.translate(canvas.width, 0);
  ctx.scale(-1, 1);

  ctx.translate((leftCenter.x + rightCenter.x) / 2,
                (leftCenter.y + rightCenter.y) / 2);
  ctx.rotate(angle);

  ctx.lineWidth = strokeWidth;
  ctx.strokeStyle = frame.color;
  ctx.lineJoin = "round";
  ctx.lineCap = "round";

  // Draw both lenses.
  for (const side of [-1, 1]) {
    const x = side * eyeDistance / 2;
    ctx.beginPath();

    if (frame.style === "round") {
      ctx.ellipse(x, 0, lensWidth * 0.48, lensHeight * 0.72, 0, 0, Math.PI * 2);
    } else if (frame.style === "aviator") {
      ctx.moveTo(x - lensWidth / 2, -lensHeight * 0.55);
      ctx.lineTo(x + lensWidth / 2, -lensHeight * 0.55);
      ctx.lineTo(x + lensWidth * 0.39, lensHeight * 0.35);
      ctx.quadraticCurveTo(x, lensHeight * 1.12, x - lensWidth * 0.39, lensHeight * 0.35);
      ctx.closePath();
    } else {
      const w = lensWidth / 2;
      const h = lensHeight / 2;
      const r = frame.style === "rect" ? h * 0.22 : h * 0.32;
      ctx.moveTo(x - w + r, -h);
      ctx.lineTo(x + w - r, -h);
      ctx.quadraticCurveTo(x + w, -h, x + w, -h + r);
      ctx.lineTo(x + w, h - r);
      ctx.quadraticCurveTo(x + w, h, x + w - r, h);
      ctx.lineTo(x - w + r, h);
      ctx.quadraticCurveTo(x - w, h, x - w, h - r);
      ctx.lineTo(x - w, -h + r);
      ctx.quadraticCurveTo(x - w, -h, x - w + r, -h);
      ctx.closePath();
    }

    ctx.stroke();
  }

  // Bridge and short temple arms.
  ctx.beginPath();
  ctx.moveTo(-lensWidth / 2, 0);
  ctx.quadraticCurveTo(0, -lensHeight * 0.18, lensWidth / 2, 0);
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(-eyeDistance / 2 - lensWidth / 2, -lensHeight * 0.24);
  ctx.lineTo(-eyeDistance / 2 - lensWidth * 0.78, -lensHeight * 0.38);
  ctx.moveTo(eyeDistance / 2 + lensWidth / 2, -lensHeight * 0.24);
  ctx.lineTo(eyeDistance / 2 + lensWidth * 0.78, -lensHeight * 0.38);
  ctx.stroke();

  // Soft reflection detail on the lens rims.
  ctx.globalAlpha = 0.22;
  ctx.lineWidth = Math.max(1, strokeWidth * 0.55);
  ctx.strokeStyle = "#ffffff";
  ctx.beginPath();
  ctx.moveTo(-eyeDistance / 2 - lensWidth * 0.28, -lensHeight * 0.45);
  ctx.lineTo(-eyeDistance / 2 - lensWidth * 0.02, -lensHeight * 0.45);
  ctx.moveTo(eyeDistance / 2 + lensWidth * 0.02, -lensHeight * 0.45);
  ctx.lineTo(eyeDistance / 2 + lensWidth * 0.28, -lensHeight * 0.45);
  ctx.stroke();

  ctx.restore();
}

function renderFrame() {
  if (!running) return;

  if (video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA &&
      video.currentTime !== lastVideoTime) {
    lastVideoTime = video.currentTime;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    try {
      const result = faceLandmarker.detectForVideo(video, performance.now());
      const landmarks = result.faceLandmarks?.[0];

      if (landmarks) {
        drawGlasses(landmarks);
        setStatus("Face detected — move naturally to explore your look.");
      } else {
        setStatus("Move into the frame and look toward the camera.");
      }
    } catch (error) {
      console.error("Face tracking error:", error);
    }
  }

  animationId = requestAnimationFrame(renderFrame);
}

function takeSnapshot() {
  if (!running || !video.videoWidth) return;

  const output = document.createElement("canvas");
  output.width = video.videoWidth;
  output.height = video.videoHeight;
  const outputCtx = output.getContext("2d");

  // Save a mirrored image to match the live preview.
  outputCtx.translate(output.width, 0);
  outputCtx.scale(-1, 1);
  outputCtx.drawImage(video, 0, 0, output.width, output.height);
  outputCtx.drawImage(canvas, 0, 0, output.width, output.height);

  const link = document.createElement("a");
  link.download = `trynsee-${selectedFrame}-${Date.now()}.png`;
  link.href = output.toDataURL("image/png");
  link.click();

  setStatus("Snapshot saved to your downloads.");
}

startButton.addEventListener("click", startCamera);
stopButton.addEventListener("click", () => stopCamera());
snapshotButton.addEventListener("click", takeSnapshot);

selectFrame("classic");

window.addEventListener("pagehide", () => {
  if (stream) stream.getTracks().forEach((track) => track.stop());
});
