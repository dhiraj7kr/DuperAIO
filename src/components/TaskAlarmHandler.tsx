// src/components/TaskAlarmHandler.tsx
import * as Notifications from 'expo-notifications';
import React, { useEffect, useState } from 'react';
import {
  Modal,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  Vibration,
  View
} from 'react-native';
import { theme } from '../theme/theme';

// Make sure this path matches your file structure
import { ANDROID_CHANNEL_ID } from '../utils/alarmManager';

interface TaskAlarmHandlerProps {
  children: React.ReactNode;
}

interface ActiveAlarm {
  notificationId: string;
  title: string;
  body?: string;
  taskId?: string;
}

const TaskAlarmHandler: React.FC<TaskAlarmHandlerProps> = ({ children }) => {
  const [activeAlarm, setActiveAlarm] = useState<ActiveAlarm | null>(null);

  // ---------------------------------------------------------
  // 1. Continuous Vibration Logic
  // ---------------------------------------------------------
  useEffect(() => {
    let iosInterval: any;

    if (activeAlarm) {
      if (Platform.OS === 'android') {
        // Android: [wait 0ms, vibrate 500ms, wait 1000ms]
        // 'true' means loop indefinitely
        Vibration.vibrate([0, 500, 1000], true);
      } else {
        // iOS simulation
        Vibration.vibrate();
        iosInterval = setInterval(() => {
          Vibration.vibrate();
        }, 1200);
      }
    }

    // CLEANUP: Runs when activeAlarm becomes null (Closed/Snoozed)
    return () => {
      Vibration.cancel();
      if (iosInterval) clearInterval(iosInterval);
    };
  }, [activeAlarm]);

  // ---------------------------------------------------------
  // 2. Notification Listeners (Updated for Snooze/Stop Actions)
  // ---------------------------------------------------------
  useEffect(() => {
    // A. Foreground notification received
    const receivedSub =
      Notifications.addNotificationReceivedListener((notification) => {
        const { title, body, data } = notification.request.content;
        const notificationId = notification.request.identifier;

        setActiveAlarm({
          notificationId,
          title: title ?? 'Task reminder',
          body: body ?? '',
          taskId: (data as any)?.taskId
        });
      });

    // B. User INTERACTED with the notification (Tapped Body, Snooze, or Stop)
    const responseSub =
      Notifications.addNotificationResponseReceivedListener(async (response) => {
        const n = response.notification;
        const { title, body, data } = n.request.content;
        const notificationId = n.request.identifier;
        const actionId = response.actionIdentifier;

        const alarmData: ActiveAlarm = {
          notificationId,
          title: title ?? 'Task reminder',
          body: body ?? '',
          taskId: (data as any)?.taskId
        };

        // HANDLE BUTTON CLICKS
        if (actionId === 'snooze') {
          // User clicked "Snooze 5 min" on the notification
          await performSnooze(alarmData);
          setActiveAlarm(null); // Ensure modal is closed
        } 
        else if (actionId === 'stop') {
          // User clicked "Stop" on the notification
          // We just dismiss the system notification and ensure no modal
          await Notifications.dismissNotificationAsync(notificationId);
          setActiveAlarm(null);
        } 
        else {
          // Default: User tapped the notification body
          // Open the modal and start vibration loop
          setActiveAlarm(alarmData);
        }
      });

    return () => {
      receivedSub.remove();
      responseSub.remove();
    };
  }, []);

  // ---------------------------------------------------------
  // 3. Logic Helpers
  // ---------------------------------------------------------
  
  const performSnooze = async (alarm: ActiveAlarm) => {
    // 1. Dismiss old notification
    if (alarm.notificationId) {
      try {
        await Notifications.dismissNotificationAsync(alarm.notificationId);
      } catch (e) {
        console.warn('Failed to dismiss original notification', e);
      }
    }

    // 2. Schedule new one in 5 mins
    const snoozeTime = new Date(Date.now() + 5 * 60 * 1000);
    const trigger: any = {
      type: Notifications.SchedulableTriggerInputTypes.DATE,
      date: snoozeTime,
      channelId: Platform.OS === 'android' ? ANDROID_CHANNEL_ID : undefined,
    };

    try {
      await Notifications.scheduleNotificationAsync({
        content: {
          title: alarm.title,
          body: 'Snoozed: ' + (alarm.body || 'Task reminder'),
          data: alarm.taskId ? { taskId: alarm.taskId } : undefined,
          sound: 'default',
          categoryIdentifier: 'alarm', // Maintain category for the snoozed alarm
          priority: Notifications.AndroidNotificationPriority.MAX,
        },
        trigger,
      });
    } catch (e) {
      console.warn('Failed to schedule snoozed notification', e);
    }
  };

  // ---------------------------------------------------------
  // 4. Modal Handlers (UI Buttons)
  // ---------------------------------------------------------

  const handleClose = async () => {
    setActiveAlarm(null); // Stops vibration via useEffect
    if (activeAlarm?.notificationId) {
       try {
         await Notifications.dismissNotificationAsync(activeAlarm.notificationId);
       } catch (e) {}
    }
  };

  const handleSnooze = async () => {
    if (!activeAlarm) return;
    await performSnooze(activeAlarm);
    setActiveAlarm(null); // Close modal & Stop vibration
  };

  const visible = !!activeAlarm;

  return (
    <>
      {children}

      <Modal transparent visible={visible} animationType="fade">
        <View style={styles.backdrop}>
          <View style={styles.card}>
            <Text style={styles.title}>
              {activeAlarm?.title ?? 'Task reminder'}
            </Text>
            {activeAlarm?.body ? (
              <Text style={styles.body}>{activeAlarm.body}</Text>
            ) : null}

            <View style={styles.buttonRow}>
              <TouchableOpacity
                style={[styles.button, styles.secondaryButton]}
                onPress={handleClose}
              >
                <Text style={styles.secondaryText}>Close</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.button, styles.primaryButton]}
                onPress={handleSnooze}
              >
                <Text style={styles.primaryText}>Snooze 5 min</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </>
  );
};

export default TaskAlarmHandler;

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(15,23,42,0.4)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: theme.spacing(2)
  },
  card: {
    width: '100%',
    maxWidth: 380,
    backgroundColor: theme.colors.card,
    borderRadius: theme.radius.xl,
    padding: theme.spacing(2),
    borderWidth: 1,
    borderColor: theme.colors.border
  },
  title: {
    fontSize: theme.fontSize.lg,
    fontWeight: '700',
    color: theme.colors.text
  },
  body: {
    marginTop: 4,
    fontSize: theme.fontSize.sm,
    color: theme.colors.textSecondary
  },
  buttonRow: {
    flexDirection: 'row',
    marginTop: theme.spacing(2)
  },
  button: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: theme.radius.lg,
    alignItems: 'center'
  },
  secondaryButton: {
    borderWidth: 1,
    borderColor: theme.colors.border,
    marginRight: 8,
    backgroundColor: '#fff' 
  },
  primaryButton: {
    backgroundColor: theme.colors.primary
  },
  secondaryText: {
    fontSize: theme.fontSize.sm,
    color: theme.colors.text,
    fontWeight: '600'
  },
  primaryText: {
    fontSize: theme.fontSize.sm,
    color: '#fff',
    fontWeight: '600'
  }
});