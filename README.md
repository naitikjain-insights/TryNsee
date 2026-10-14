
# TryNSee 👓

### See Yourself in Style.

TryNSee is a virtual glasses try-on website that lets users explore different eyewear styles using their device camera.

## ✨ Features

- 📷 Camera-powered virtual mirror
- 👓 Four frame styles: Classic, Round, Aviator, and Crystal
- 🎯 Face landmark tracking with MediaPipe
- 📸 Download a snapshot of your look
- 📱 Responsive design for mobile and desktop
- 🔒 Camera access requires user permission
- 🌙 Premium dark theme with lime accents

## 🛠️ Technologies Used

- HTML5
- CSS3
- JavaScript
- MediaPipe Face Landmarker
- GitHub Pages

## 🚀 Live Demo

Once GitHub Pages is enabled, your website will be available at:

`https://YOUR-USERNAME.github.io/trynsee/`

Replace `YOUR-USERNAME` with your GitHub username.

## 💻 Run Locally

1. Download or clone this repository.
2. Open the project folder in VS Code.
3. Start the project with the Live Server extension.

Alternatively, if Python is installed, run:

```bash
python -m http.server 8000
```

Then open:

`http://localhost:8000`

## 📷 Camera Permissions

Camera access requires HTTPS or localhost in supported browsers.

For face tracking, the website needs an internet connection to load the MediaPipe library and model.

If the camera does not start, check browser permissions and close other apps using the camera.

## 🔐 Privacy

The demo processes the camera stream in the browser. It does not include a backend or upload photos to a TryNSee server. Downloaded snapshots are saved locally by the browser.

Third-party libraries and models are loaded from external providers.

## ⚠️ Disclaimer

TryNSee is a demonstration project. Frame positioning and alignment may vary depending on lighting, camera quality, and face position. It is not a substitute for professional eyewear fitting.

## 📄 License

This project is available for personal learning and development. Add a license file if you want to specify formal reuse terms.

---

Made with ❤️ for eyewear lovers.

**TryNSee — See Yourself in Style.**
