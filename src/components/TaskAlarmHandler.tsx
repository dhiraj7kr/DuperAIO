// src/components/TaskAlarmHandler.tsx
import { Ionicons } from '@expo/vector-icons';
import * as Notifications from 'expo-notifications';
import React, { useEffect, useRef, useState } from 'react';
import {
  Animated,
  Dimensions,
  Modal,
  PanResponder,
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

const { width } = Dimensions.get('window');
const SLIDE_THRESHOLD = width * 0.35; // Increased slightly to prevent accidental swipes

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
  const [snoozeMinutes, setSnoozeMinutes] = useState<5 | 30>(5);

  // 1. FIX: Use a Ref to track snooze time so PanResponder can read the LATEST value
  const snoozeMinutesRef = useRef<5 | 30>(5);
  // 2. FIX: Use a Ref to track the alarm object inside the gesture
  const activeAlarmRef = useRef<ActiveAlarm | null>(null);

  // Sync state to refs
  useEffect(() => {
    snoozeMinutesRef.current = snoozeMinutes;
  }, [snoozeMinutes]);

  useEffect(() => {
    activeAlarmRef.current = activeAlarm;
  }, [activeAlarm]);

  // ---------------------------------------------------------
  // 3. Continuous Vibration Logic
  // ---------------------------------------------------------
  useEffect(() => {
    let iosInterval: any;

    if (activeAlarm) {
      if (Platform.OS === 'android') {
        Vibration.vibrate([0, 500, 1000], true);
      } else {
        Vibration.vibrate();
        iosInterval = setInterval(() => {
          Vibration.vibrate();
        }, 1200);
      }
    }

    return () => {
      Vibration.cancel();
      if (iosInterval) clearInterval(iosInterval);
    };
  }, [activeAlarm]);

  // ---------------------------------------------------------
  // 4. Notification Listeners
  // ---------------------------------------------------------
  useEffect(() => {
    const receivedSub =
      Notifications.addNotificationReceivedListener((notification) => {
        const { title, body, data } = notification.request.content;
        const notificationId = notification.request.identifier;
        
        // When alarm triggers, reset everything
        setSnoozeMinutes(5); 
        setActiveAlarm({
          notificationId,
          title: title ?? 'Task reminder',
          body: body ?? '',
          taskId: (data as any)?.taskId
        });
      });

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

        if (actionId === 'snooze') {
          await performSnooze(alarmData, 5);
          setActiveAlarm(null);
        } else if (actionId === 'stop') {
          await Notifications.dismissNotificationAsync(notificationId);
          setActiveAlarm(null);
        } else {
          setActiveAlarm(alarmData);
        }
      });

    return () => {
      receivedSub.remove();
      responseSub.remove();
    };
  }, []);

  // ---------------------------------------------------------
  // 5. Logic Helpers
  // ---------------------------------------------------------
  const performSnooze = async (alarm: ActiveAlarm, minutes: number) => {
    if (alarm.notificationId) {
      try {
        await Notifications.dismissNotificationAsync(alarm.notificationId);
      } catch (e) {}
    }

    const snoozeTime = new Date(Date.now() + minutes * 60 * 1000);
    
    // Cast to 'any' to fix TS error
    const trigger: any = {
      type: Notifications.SchedulableTriggerInputTypes.DATE,
      date: snoozeTime,
      channelId: Platform.OS === 'android' ? ANDROID_CHANNEL_ID : undefined,
    };

    try {
      await Notifications.scheduleNotificationAsync({
        content: {
          title: alarm.title,
          body: `Snoozed (${minutes}m): ` + (alarm.body || 'Task reminder'),
          data: alarm.taskId ? { taskId: alarm.taskId } : undefined,
          sound: 'default',
          categoryIdentifier: 'alarm',
          priority: Notifications.AndroidNotificationPriority.MAX,
        },
        trigger,
      });
    } catch (e) {
      console.warn('Failed to schedule snoozed notification', e);
    }
  };

  const executeSnooze = async () => {
    const alarm = activeAlarmRef.current;
    if (!alarm) return;
    
    // Use the value from REF to ensure it's the latest choice (5 or 30)
    await performSnooze(alarm, snoozeMinutesRef.current);
    setActiveAlarm(null);
  };

  const executeClose = async () => {
    const alarm = activeAlarmRef.current;
    if (!alarm) return;

    if (alarm.notificationId) {
      try {
        await Notifications.dismissNotificationAsync(alarm.notificationId);
      } catch (e) {}
    }
    setActiveAlarm(null);
  };

  // ---------------------------------------------------------
  // 6. Animation & PanResponder
  // ---------------------------------------------------------
  const pan = useRef(new Animated.ValueXY()).current;
  const slideOpacity = useRef(new Animated.Value(1)).current;

  // Reset when alarm opens
  useEffect(() => {
    if (activeAlarm) {
      pan.setValue({ x: 0, y: 0 });
      slideOpacity.setValue(1);
    }
  }, [activeAlarm]);

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onPanResponderMove: (_, gestureState) => {
        pan.setValue({ x: gestureState.dx, y: 0 });
        const opacity = 1 - Math.abs(gestureState.dx) / (width * 0.4);
        slideOpacity.setValue(Math.max(0, opacity));
      },
      onPanResponderRelease: (_, gestureState) => {
        // --- RIGHT: SNOOZE ---
        if (gestureState.dx > SLIDE_THRESHOLD) {
          // 1. Stop vibration IMMEDIATELY so it doesn't get stuck
          Vibration.cancel();
          
          Animated.timing(pan, {
            toValue: { x: width, y: 0 },
            duration: 200,
            useNativeDriver: false,
          }).start(() => {
            executeSnooze(); // Runs after animation
          });
        } 
        // --- LEFT: CLOSE ---
        else if (gestureState.dx < -SLIDE_THRESHOLD) {
          // 1. Stop vibration IMMEDIATELY
          Vibration.cancel();

          Animated.timing(pan, {
            toValue: { x: -width, y: 0 },
            duration: 200,
            useNativeDriver: false,
          }).start(() => {
            executeClose();
          });
        } 
        // --- RESET ---
        else {
          Animated.spring(pan, {
            toValue: { x: 0, y: 0 },
            useNativeDriver: false,
          }).start();
          Animated.timing(slideOpacity, {
            toValue: 1,
            duration: 200,
            useNativeDriver: false,
          }).start();
        }
      },
    })
  ).current;

  const backgroundColor = pan.x.interpolate({
    inputRange: [-width, 0, width],
    outputRange: ['#EF4444', '#1E293B', '#3B82F6'], // Red -> Dark -> Blue
    extrapolate: 'clamp',
  });

  const visible = !!activeAlarm;

  return (
    <>
      {children}

      <Modal visible={visible} transparent animationType="fade">
        <Animated.View style={[styles.fullScreenContainer, { backgroundColor }]}>
          
          <View style={styles.header}>
            <Ionicons name="alarm" size={48} color="#fff" />
            <Text style={styles.alarmTitle}>
              {activeAlarm?.title ?? 'Task Reminder'}
            </Text>
            <Text style={styles.alarmBody}>{activeAlarm?.body}</Text>
          </View>

          <View style={styles.snoozeSelectorContainer}>
            <Text style={styles.snoozeLabel}>Snooze duration:</Text>
            <View style={styles.selectorRow}>
              <TouchableOpacity
                style={[
                  styles.selectorBtn,
                  snoozeMinutes === 5 && styles.selectorBtnActive
                ]}
                onPress={() => setSnoozeMinutes(5)}
              >
                <Text
                  style={[
                    styles.selectorText,
                    snoozeMinutes === 5 && styles.selectorTextActive
                  ]}
                >
                  5 min
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.selectorBtn,
                  snoozeMinutes === 30 && styles.selectorBtnActive
                ]}
                onPress={() => setSnoozeMinutes(30)}
              >
                <Text
                  style={[
                    styles.selectorText,
                    snoozeMinutes === 30 && styles.selectorTextActive
                  ]}
                >
                  30 min
                </Text>
              </TouchableOpacity>
            </View>
          </View>

          <View style={styles.sliderContainer}>
            <View style={styles.track}>
              <Animated.View style={{ opacity: slideOpacity, flexDirection: 'row', justifyContent: 'space-between', width: '100%', paddingHorizontal: 20 }}>
                <View style={styles.slideLabelRow}>
                  <Ionicons name="close" size={20} color="#fff" />
                  <Text style={styles.trackText}>Slide to Close</Text>
                </View>
                <View style={styles.slideLabelRow}>
                  <Text style={styles.trackText}>Snooze</Text>
                  <Ionicons name="chevron-forward" size={20} color="#fff" />
                </View>
              </Animated.View>
            </View>

            <Animated.View
              {...panResponder.panHandlers}
              style={[
                styles.knob,
                { transform: [{ translateX: pan.x }] }
              ]}
            >
              <Ionicons name="code-working" size={24} color={theme.colors.primary} />
            </Animated.View>
          </View>

        </Animated.View>
      </Modal>
    </>
  );
};

export default TaskAlarmHandler;

const styles = StyleSheet.create({
  fullScreenContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 30,
  },
  header: {
    alignItems: 'center',
    marginBottom: 50,
  },
  alarmTitle: {
    color: '#fff',
    fontSize: 28,
    fontWeight: '800',
    marginTop: 16,
    textAlign: 'center',
  },
  alarmBody: {
    color: '#CBD5E1',
    fontSize: 16,
    marginTop: 8,
    textAlign: 'center',
  },
  snoozeSelectorContainer: {
    alignItems: 'center',
    marginBottom: 40,
  },
  snoozeLabel: {
    color: '#94A3B8',
    fontSize: 14,
    marginBottom: 10,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  selectorRow: {
    flexDirection: 'row',
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 99,
    padding: 4,
  },
  selectorBtn: {
    paddingVertical: 8,
    paddingHorizontal: 20,
    borderRadius: 99,
  },
  selectorBtnActive: {
    backgroundColor: '#fff',
  },
  selectorText: {
    color: '#fff',
    fontWeight: '600',
  },
  selectorTextActive: {
    color: '#0F172A',
  },
  sliderContainer: {
    width: '100%',
    height: 70,
    justifyContent: 'center',
    alignItems: 'center',
  },
  track: {
    position: 'absolute',
    width: '100%',
    height: 60,
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderRadius: 30,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
  },
  trackText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 14,
    marginHorizontal: 5,
  },
  slideLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  knob: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#fff',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.3,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 5 },
    elevation: 5,
  },
});