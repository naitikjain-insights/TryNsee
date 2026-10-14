
"use strict";

// TryNSee - Virtual Glasses Try-On
// Camera processing runs in the browser.

const video = document.getElementById("camera-video");
const canvas = document.getElementById("camera-canvas");
const ctx = canvas.getContext("2d");

const cameraStage = document.getElementById("camera-stage");
const placeholder = document.getElementById("camera-placeholder");
const startButton = document.getElementById("start-camera");
const stopButton = document.getElementById("stop-camera");
const captureButton = document.getElementById("capture-photo");
const cameraStatus = document.getElementById("camera-status");
const cameraMessage = document.getElementById("camera-message");
const cameraHint = document.getElementById("camera-hint");
const frameButtons = document.querySelectorAll(".frame-option");

let cameraStream = null;
let faceLandmarker = null;
let animationId = null;
let selectedFrame = "classic";
let lastVideoTime = -1;
let trackingReady = false;
let loadingVision = null;

// Different frame designs
const frameStyles = {
  classic: {
    color: "#15151b",
    lens: "rgba(190, 225, 240, 0.10)",
    shape: "classic",
    lineWidth: 0.045
  },
  round: {
    color: "#292a32",
    lens: "rgba(190, 225, 240, 0.13)",
    shape: "round",
    lineWidth: 0.045
  },
  aviator: {
    color: "#b9a16d",
    lens: "rgba(190, 225, 240, 0.15)",
    shape: "aviator",
    lineWidth: 0.035
  },
  clear: {
    color: "rgba(190, 225, 240, 0.85)",
    lens: "rgba(190, 225, 240, 0.06)",
    shape: "clear",
    lineWidth: 0.035
  }
};

// Update the selected frame
frameButtons.forEach((button) => {
  button.addEventListener("click", () => {
    selectedFrame = button.dataset.frame || "classic";

    frameButtons.forEach((item) => {
      const isSelected = item === button;
      item.classList.toggle("active", isSelected);
      item.setAttribute("aria-pressed", String(isSelected));
    });

    if (cameraStream && !trackingReady) {
      cameraMessage.textContent =
        "Frame selected. Waiting for face tracking to initialize.";
    } else if (trackingReady) {
      cameraMessage.textContent =
        "Frame updated. Look straight at your camera.";
    }
  });
});

// Load MediaPipe Face Landmarker
async function loadFaceTracking() {
  if (faceLandmarker) {
    return faceLandmarker;
  }

  if (loadingVision) {
    return loadingVision;
  }

  loadingVision = (async () => {
    const vision = await import(
      "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/vision_bundle.mjs"
    );

    const files = await vision.FilesetResolver.forVisionTasks(
      "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm"
    );

    faceLandmarker = await vision.FaceLandmarker.createFromOptions(
      files,
      {
        baseOptions: {
          modelAssetPath:
            "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task",
          delegate: "GPU"
        },
        runningMode: "VIDEO",
        numFaces: 1,
        minFaceDetectionConfidence: 0.5,
        minFacePresenceConfidence: 0.5,
        minTrackingConfidence: 0.5
      }
    );

    return faceLandmarker;
  })();

  try {
    return await loadingVision;
  } catch (error) {
    loadingVision = null;
    throw error;
  }
}

// Start the camera
async function startCamera() {
  if (cameraStream) return;

  if (!navigator.mediaDevices?.getUserMedia) {
    cameraMessage.textContent =
      "Camera access is unavailable. Open this website over HTTPS or localhost.";
    return;
  }

  startButton.disabled = true;
  startButton.textContent = "Starting camera...";
  cameraMessage.textContent = "Requesting camera permission...";

  try {
    cameraStream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: {
        facingMode: "user",
        width: { ideal: 1280 },
        height: { ideal: 720 }
      }
    });

    video.srcObject = cameraStream;
    await video.play();

    cameraStage.classList.add("camera-active");
    placeholder.hidden = true;

    startButton.disabled = true;
    stopButton.disabled = false;
    captureButton.disabled = false;

    cameraStatus.textContent = "Loading face tracking...";
    cameraStatus.classList.add("is-on");

    cameraMessage.textContent =
      "Loading face tracking model. This may take a moment.";

    await loadFaceTracking();

    if (!cameraStream) return;

    trackingReady = true;
    lastVideoTime = -1;

    cameraStatus.textContent = "Camera on";
    cameraMessage.textContent =
      "Face tracking is ready. Select a frame and look at the camera.";
    cameraHint.textContent = "Look straight at your camera";

    renderFrame();
  } catch (error) {
    console.error("TryNSee camera error:", error);

    stopCamera();

    if (error.name === "NotAllowedError") {
      cameraMessage.textContent =
        "Camera permission was denied. Allow camera access in your browser settings and try again.";
    } else if (error.name === "NotFoundError") {
      cameraMessage.textContent =
        "No camera was found. Connect a camera and try again.";
    } else if (error.name === "NotReadableError") {
      cameraMessage.textContent =
        "The camera may be in use by another application. Close that app and try again.";
    } else {
      cameraMessage.textContent =
        "Could not start the camera or face tracking. Check your internet connection and browser permissions, then try again.";
    }
  } finally {
    startButton.textContent = "Enable camera ↗";
    startButton.disabled = Boolean(cameraStream);
  }
}

// Find the approximate centre of each eye
function getEyeCenter(landmarks, first, second, width, height) {
  const a = landmarks[first];
  const b = landmarks[second];

  return {
    x: ((a.x + b.x) / 2) * width,
    y: ((a.y + b.y) / 2) * height
  };
}

function roundedRectPath(x, y, width, height, radius) {
  const r = Math.min(radius, width / 2, height / 2);

  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + width - r, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + r);
  ctx.lineTo(x + width, y + height - r);
  ctx.quadraticCurveTo(
    x + width,
    y + height,
    x + width - r,
    y + height
  );
  ctx.lineTo(x + r, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

// Draw a pair of glasses over the detected eyes
function drawGlasses(leftEye, rightEye) {
  const style = frameStyles[selectedFrame];
  const dx = rightEye.x - leftEye.x;
  const dy = rightEye.y - leftEye.y;
  const eyeDistance = Math.hypot(dx, dy);

  if (eyeDistance < 10) return;

  const angle = Math.atan2(dy, dx);
  const lensWidth = eyeDistance * 0.53;
  const lensHeight = lensWidth * 0.70;
  const bridgeWidth = eyeDistance * 0.18;
  const halfDistance = eyeDistance / 2;

  ctx.save();

  // Mirror the drawing to match the mirrored camera preview.
  ctx.translate(canvas.width, 0);
  ctx.scale(-1, 1);

  ctx.translate(
    (leftEye.x + rightEye.x) / 2,
    (leftEye.y + rightEye.y) / 2
  );

  ctx.rotate(angle);

  ctx.lineWidth = Math.max(2, lensWidth * style.lineWidth);
  ctx.strokeStyle = style.color;
  ctx.fillStyle = style.lens;
  ctx.lineJoin = "round";
  ctx.lineCap = "round";

  const leftX = -halfDistance - lensWidth / 2;
  const rightX = halfDistance - lensWidth / 2;
  const topY = -lensHeight / 2;

  function drawLens(x) {
    ctx.beginPath();

    if (style.shape === "round") {
      ctx.ellipse(
        x + lensWidth / 2,
        0,
        lensWidth * 0.47,
        lensHeight * 0.57,
        0,
        0,
        Math.PI * 2
      );
    } else if (style.shape === "aviator") {
      ctx.moveTo(x + lensWidth * 0.06, topY);
      ctx.lineTo(x + lensWidth * 0.94, topY);
      ctx.lineTo(x + lensWidth * 0.84, lensHeight * 0.36);
      ctx.quadraticCurveTo(
        x + lensWidth * 0.5,
        lensHeight * 0.85,
        x + lensWidth * 0.16,
        lensHeight * 0.36
      );
      ctx.closePath();
    } else {
      const inset = style.shape === "clear" ? 7 : 2;
      roundedRectPath(
        x,
        topY,
        lensWidth,
        lensHeight,
        lensHeight * (style.shape === "clear" ? 0.35 : 0.18) + inset
      );
    }

    ctx.fill();
    ctx.stroke();
  }

  drawLens(leftX);
  drawLens(rightX);

  // Bridge connecting both lenses
  ctx.beginPath();
  ctx.moveTo(-bridgeWidth / 2, -lensHeight * 0.16);
  ctx.quadraticCurveTo(
    0,
    -lensHeight * 0.34,
    bridgeWidth / 2,
    -lensHeight * 0.16
  );
  ctx.stroke();

  // Side arms
  ctx.beginPath();
  ctx.moveTo(leftX, -lensHeight * 0.22);
  ctx.lineTo(leftX - lensWidth * 0.23, -lensHeight * 0.40);
  ctx.moveTo(rightX + lensWidth, -lensHeight * 0.22);
  ctx.lineTo(rightX + lensWidth * 1.23, -lensHeight * 0.40);
  ctx.stroke();

  ctx.restore();
}

// Process video and update glasses on each animation frame
function renderFrame() {
  if (!cameraStream || !faceLandmarker) return;

  if (
    video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA &&
    video.videoWidth > 0
  ) {
    if (
      canvas.width !== video.videoWidth ||
      canvas.height !== video.videoHeight
    ) {
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
    }

    if (video.currentTime !== lastVideoTime) {
      lastVideoTime = video.currentTime;

      ctx.clearRect(0, 0, canvas.width, canvas.height);

      try {
        const result = faceLandmarker.detectForVideo(
          video,
          performance.now()
        );

        if (result.faceLandmarks?.length) {
          const landmarks = result.faceLandmarks[0];

          // Eye corner landmarks from MediaPipe Face Landmarker.
          const leftEye = getEyeCenter(
            landmarks, 33, 133, canvas.width, canvas.height
          );
          const rightEye = getEyeCenter(
            landmarks, 362, 263, canvas.width, canvas.height
          );

          drawGlasses(leftEye, rightEye);

          cameraHint.textContent = "Frame follows your eye position";
        } else {
          cameraHint.textContent = "Move your face into the centre";
        }
      } catch (error) {
        console.error("Face tracking error:", error);
      }
    }
  }

  animationId = requestAnimationFrame(renderFrame);
}

// Take a mirrored snapshot including the glasses overlay
function capturePhoto() {
  if (!cameraStream || !video.videoWidth) return;

  const photoCanvas = document.createElement("canvas");
  photoCanvas.width = video.videoWidth;
  photoCanvas.height = video.videoHeight;

  const photoCtx = photoCanvas.getContext("2d");

  photoCtx.save();
  photoCtx.translate(photoCanvas.width, 0);
  photoCtx.scale(-1, 1);
  photoCtx.drawImage(
    video,
    0,
    0,
    photoCanvas.width,
    photoCanvas.height
  );
  photoCtx.restore();

  // The overlay canvas already contains the mirrored glasses.
  photoCtx.drawImage(canvas, 0, 0);

  const link = document.createElement("a");
  link.download = "trynsee-snapshot.png";
  link.href = photoCanvas.toDataURL("image/png");
  link.click();

  cameraMessage.textContent =
    "Your snapshot has been downloaded to your device.";
}

// Stop camera and release resources
function stopCamera() {
  if (animationId !== null) {
    cancelAnimationFrame(animationId);
    animationId = null;
  }

  if (cameraStream) {
    cameraStream.getTracks().forEach((track) => track.stop());
    cameraStream = null;
  }

  video.pause();
  video.srcObject = null;

  ctx.clearRect(0, 0, canvas.width, canvas.height);

  cameraStage.classList.remove("camera-active");
  placeholder.hidden = false;

  startButton.disabled = false;
  stopButton.disabled = true;
  captureButton.disabled = true;

  cameraStatus.textContent = "Camera off";
  cameraStatus.classList.remove("is-on");

  cameraMessage.textContent =
    "Your camera starts only when you allow access.";

  cameraHint.textContent = "Position your face in the centre";
  trackingReady = false;
  lastVideoTime = -1;
}

// Connect the controls
startButton.addEventListener("click", startCamera);
stopButton.addEventListener("click", stopCamera);
captureButton.addEventListener("click", capturePhoto);

// Update the footer year
const yearElement = document.getElementById("year");

if (yearElement) {
  yearElement.textContent = new Date().getFullYear();
}

// Release the camera when the page is closed or left
window.addEventListener("pagehide", stopCamera);
