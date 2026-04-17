# GPS TRACKER
![HTML](https://img.shields.io/badge/HTML-E34F26?logo=html5&logoColor=white)
![CSS](https://img.shields.io/badge/CSS-1572B6?logo=css3&logoColor=white)
![JS](https://img.shields.io/badge/JS-F7DF1E?logo=javascript&logoColor=black)
![Leaflet](https://img.shields.io/badge/Leaflet-199900?logo=leaflet&logoColor=white)
![Firebase](https://img.shields.io/badge/Firebase-FFA000?logo=firebase&logoColor=white)
![Node](https://img.shields.io/badge/Node-339933?logo=node.js&logoColor=white)
![Vite](https://img.shields.io/badge/Vite-646CFF?logo=vite&logoColor=FFD62E)
![CI](https://img.shields.io/github/actions/workflow/status/reihakuro/gps-tracker-web/deploy.yml?label=Format&logo=github)

Real-time IoT monitoring dashboard designed to track vehicle location, monitor device status, and detect emergency fall events. Built with Vite

This is a dashboard part of the project. <br>

_See more:_ <br>
GPS TRACKER <br>
├─ [**gps-tracker**](https://github.com/reihakuro/gps-tracker) <br>
└─ [**gps-tracker-web**](https://github.com/reihakuro/gps-tracker-web)

## 🪧 Repository Overview
```
gps-tracker-web/
├── .github/workflows/      
├── gps-tracker/            # Main Application Directory
│   ├── public/             # Static assets 
│   ├── src/                # Application Source Code
│   │   ├── assets/         # Images and complex CSS
│   │   ├── app.js          # Core logic & Map initialization
│   │   ├── config.js       # Firebase & i18n configuration
│   │   ├── dataService.js  # Database CRUD operations
│   │   └── style.css       # Global styling
│   ├── index.html          # Entry point
│   └── package.json        # Dependencies & Scripts
├── firebase.json           # Firebase Hosting configuration
└── .firebaserc             # Firebase project aliases
```
## ✨ Features
- Real-time Tracking: Live GPS coordinates streamed via Firebase Realtime Database.
- Fall Detection: Instant visual and push notification alerts triggered by MPU6050 accelerometer data.
- Intelligent Routing: Multi-mode directions using Leaflet Routing Machine.
- Historical Data: Detailed logs of travel history and incident reports with Excel export functionality.
- Multi-language Support: Dynamic i18n switching between Vietnamese and English.

## 👀 Preview

## ⛏️ Configuration
### Prerequisites
Node.js: Version 20.x or higher (Required for Vite 6+) <br>
Firebase Project: A configured Firebase account with Realtime Database and Auth enabled.
### Setup
Install dependencies: ``../gps-tracker > npm install``

Environment Setup: Create a .env file in the gps-tracker/ directory and add Firebase credentials:
```
VITE_FIREBASE_API_KEY=your_api_key
VITE_FIREBASE_DATABASE_URL=your_db_url
```

Run: ``npm run dev``
