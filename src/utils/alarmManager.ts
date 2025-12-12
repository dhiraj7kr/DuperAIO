// src/utils/alarmManager.ts
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

/**
 * CONFIGURATION
 */
// Channel ID (v2 to force vibration update)
export const ANDROID_CHANNEL_ID = 'task-reminders-v2';

// Notification Handler
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

// ---------------- TYPES ----------------

export type AlarmLeadMinutes = 0 | 5 | 30;
export type AlarmMode = 'silent' | 'sound' | 'vibrate';

export interface TaskForAlarm {
  id: string;
  title: string;
  date: string;       // "YYYY-MM-DD"
  startTime?: string; // "HH:mm" (24h)
}

export interface AlarmSettings {
  leadMinutes: AlarmLeadMinutes;
  mode: AlarmMode;
}

// ---------------- INIT ----------------

export async function initTaskAlarms() {
  // 1. Setup Android Channel
  if (Platform.OS === 'android') {
    try {
      await Notifications.setNotificationChannelAsync(ANDROID_CHANNEL_ID, {
        name: 'Task reminders',
        importance: Notifications.AndroidImportance.HIGH,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: '#2563EB',
        sound: 'default',
        enableVibrate: true,
        lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
      });
    } catch (e) {
      console.warn('Failed to set Android notification channel', e);
    }
  }

  // 2. Setup Notification Categories (Actions: Snooze / Stop)
  try {
    await Notifications.setNotificationCategoryAsync('alarm', [
      {
        identifier: 'snooze',
        buttonTitle: 'Snooze 5 min',
        options: {
          opensAppToForeground: true, // Open app to run snooze logic
        },
      },
      {
        identifier: 'stop',
        buttonTitle: 'Stop',
        options: {
          opensAppToForeground: true, // Open app to stop vibration
        },
      },
    ]);
  } catch (e) {
    console.warn('Failed to set notification categories', e);
  }

  // 3. Request Permissions
  try {
    const { status } = await Notifications.getPermissionsAsync();
    if (status !== 'granted') {
      await Notifications.requestPermissionsAsync();
    }
  } catch (e) {
    console.warn('Failed to get notification permissions', e);
  }
}

// ---------------- HELPER ----------------

export function getTaskStartDateTime(task: TaskForAlarm): Date {
  const [year, month, day] = task.date.split('-').map((p) => parseInt(p, 10));
  let hour = 9;
  let minute = 0;

  if (task.startTime) {
    const [h, m] = task.startTime.split(':').map((p) => parseInt(p, 10));
    if (!isNaN(h)) hour = h;
    if (!isNaN(m)) minute = m;
  }

  return new Date(year, month - 1, day, hour, minute, 0, 0);
}

// ---------------- MAIN: SCHEDULE ----------------

export async function scheduleTaskReminder(
  task: TaskForAlarm,
  settings: AlarmSettings
): Promise<string | null> {
  const { leadMinutes, mode } = settings;

  if (leadMinutes <= 0) return null;

  const taskDateTime = getTaskStartDateTime(task);
  const triggerTime = new Date(taskDateTime.getTime() - leadMinutes * 60 * 1000);
  const now = new Date();

  if (triggerTime.getTime() <= now.getTime()) {
    return null;
  }

  // Prepare content
  const content: Notifications.NotificationContentInput = {
    title: `Upcoming: ${task.title}`,
    body: leadMinutes === 5 
      ? 'Tap to stop or snooze' 
      : `Starts in ${leadMinutes} minutes`,
    categoryIdentifier: 'alarm', // <--- Links to the Snooze/Stop buttons
    priority: Notifications.AndroidNotificationPriority.MAX, // <--- Key for waking screen
    autoDismiss: false, // <--- Keeps notification visible
    data: {
      taskId: task.id,
      taskTitle: task.title,
      taskDate: task.date,
      taskStartTime: task.startTime ?? null
    },
  };

  // Handle Modes
  if (mode === 'sound') {
    content.sound = 'default'; 
  } else if (mode === 'silent') {
    content.sound = undefined;      
  } else if (mode === 'vibrate') {
    content.sound = 'default'; 
  }

  // Prepare Trigger
  const trigger: any = {
    type: Notifications.SchedulableTriggerInputTypes.DATE,
    date: triggerTime,
    channelId: Platform.OS === 'android' ? ANDROID_CHANNEL_ID : undefined,
  };

  try {
    const id = await Notifications.scheduleNotificationAsync({
      content,
      trigger,
    });
    return id;
  } catch (e) {
    console.warn('Failed to schedule task reminder', e);
    return null;
  }
}

export async function cancelReminderById(notificationId: string) {
  try {
    await Notifications.cancelScheduledNotificationAsync(notificationId);
  } catch (e) {
    console.warn('Failed to cancel reminder', e);
  }
}