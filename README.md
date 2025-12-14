
# 🚀 DUPER
https://expo.dev/accounts/dhiraj7kr/projects/duper-productivity/builds/df7fefa1-bce2-49ed-bef4-7991bd4978ac

**Duper** is an all-in-one personal productivity dashboard built with **React Native** and **Expo**. It combines task planning, financial tracking, habit streaks, and environment monitoring into a single, cohesive, and aesthetically pleasing interface.

> **Philosophy:** Your life shouldn't require five different apps. Duper brings your Calendar, Wallet, Notes, and Environment together.

-----

## ✨ Key Features

### 🏠 **Smart Dashboard**

  * **"At a Glance" Super Card:** A unified view showing real-time Weather, Date, Air Quality Index (AQI), and Network Latency (Ping).
  * **Focus of the Day:** A persistent pinned note to keep your main daily goal front and center.
  * **Activity Streak:** A GitHub-style contribution graph that visualizes your productivity over the last 14 days.
  * **Up Next:** Smart logic that shows only future tasks for the current day.

### 📅 **Planner**

  * **Recurring Tasks:** Support for Daily, Weekly, Monthly, and Yearly repeating tasks.
  * **Smart Completion:** Mark specific instances of repeating tasks as done without breaking the schedule.
  * **Conflict Free:** Visual indicators for overlapping schedules.

### 💰 **Wallet (Expenses)**

  * **Transaction Tracking:** Log Credits and Debits easily.
  * **JSON-Based Storage:** Data is stored locally on the device for maximum privacy.
  * **Visual History:** Clean list of recent transactions.

### 📝 **Notes (Coming Soon)**

  * **Quick Capture:** Jot down ideas instantly.
  * **Categories:** Organize thoughts by tag or project.

-----

## 🛠 Tech Stack

  * **Framework:** [React Native](https://reactnative.dev/) (via [Expo](https://expo.dev/))
  * **Routing:** [Expo Router](https://docs.expo.dev/router/introduction/) (File-based routing)
  * **Language:** TypeScript / JavaScript
  * **Storage:**
      * `AsyncStorage`: For lightweight settings and flags.
      * `expo-file-system`: For robust JSON-based data persistence (Expenses/Tasks).
  * **APIs:**
      * [Open-Meteo](https://open-meteo.com/): For Weather and AQI data (No API Key required).
      * `expo-network`: For real-time connectivity status.
      * `expo-location`: For localized weather data.
  * **Icons:** Ionicons (`@expo/vector-icons`).

-----

## 📂 Project Structure

```bash
Duper/
├── app/                    # Expo Router Screens
│   ├── index.tsx           # Home Dashboard
│   ├── planner.tsx         # Task Manager
│   ├── expenses.tsx        # Wallet/Transactions
│   ├── notes.tsx           # Notes App
│   └── _layout.tsx         # Navigation Configuration
├── assets/
│   └── images/             # App Icons and Logos
├── src/
│   ├── components/         # Reusable UI Components
│   │   └── BouncyCard.tsx  # Animated Card Component
│   └── context/
│       └── AppDataContext.tsx # Global State (Profile, etc.)
└── package.json
```

-----

## 🚀 Getting Started

Follow these steps to run Duper locally on your machine.

### Prerequisites

  * Node.js (LTS version recommended)
  * Expo Go app installed on your physical device (Android/iOS) OR an Emulator/Simulator.

### Installation

1.  **Clone the repository**

    ```bash
    git clone https://github.com/yourusername/duper.git
    cd duper
    ```

2.  **Install dependencies**

    ```bash
    npm install
    # or
    yarn install
    ```

3.  **Start the app**

    ```bash
    npx expo start
    ```

4.  **Run on Device**

      * Scan the QR code displayed in the terminal using the **Expo Go** app on your phone.
      * Press `a` to run on Android Emulator.
      * Press `i` to run on iOS Simulator.

-----

## 💾 Data & Privacy

**Duper is Local-First.**
We do not store your data on any cloud server.

  * **Profile Data:** Stored in `AsyncStorage`.
  * **Tasks & Expenses:** Stored in JSON files within the app's document directory.
  * **Backup:** To backup your data, you can export the generated JSON files (Feature coming in v1.1).

-----

## 🎨 Customization

### Theming

The app uses a centralized `THEME` object located in `app/index.tsx` (and shared files). You can easily customize the color palette:

```javascript
const THEME = {
  bg: '#F3F4F6',
  accentBlue: '#2563EB',
  textMain: '#111827',
  // ...
};
```

### Changing the Logo

Replace the file at `assets/images/android-icon-foreground.png` with your own PNG logo to update the branding in the header.

-----

## 🤝 Contributing

Contributions are what make the open-source community such an amazing place to learn, inspire, and create. Any contributions you make are **greatly appreciated**.

1.  Fork the Project
2.  Create your Feature Branch (`git checkout -b feature/AmazingFeature`)
3.  Commit your Changes (`git commit -m 'Add some AmazingFeature'`)
4.  Push to the Branch (`git push origin feature/AmazingFeature`)
5.  Open a Pull Request

-----

## 📄 License

Distributed under the MIT License. See `LICENSE` for more information.

-----

**Duper** — Organize your life, simply.
