import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import DateTimePicker from '@react-native-community/datetimepicker';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Animated,
  Dimensions,
  KeyboardAvoidingView,
  Modal,
  PanResponder,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context'; // <--- ADDED IMPORT
import {
  AlarmLeadMinutes,
  AlarmMode,
  cancelReminderById,
  initTaskAlarms,
  scheduleTaskReminder,
} from '../utils/alarmManager';

// --- Configuration ---
const STORAGE_KEY = 'plannerTasks_v3';
const SCREEN_WIDTH = Dimensions.get('window').width;
const SWIPE_THRESHOLD = 80;
const PRIMARY_COLOR = '#007AFF'; // iOS Blue
const ACCENT_COLOR = '#FF3B30'; // iOS Red (for Today/Delete)

// --- Types ---
type RepeatRule = 'none' | 'daily' | 'weekly' | 'monthly' | 'yearly';
type TaskType = 'task' | 'event';

interface Task {
  id: string;
  title: string;
  date: string; // 'YYYY-MM-DD'
  startTime?: string;
  endTime?: string;
  notes?: string;
  link?: string;
  associated?: string;
  isCompleted: boolean;
  completedExceptions?: string[]; 
  repeat: RepeatRule;
  type: TaskType;
  createdAt: string;
  updatedAt: string;
  reminderLeadMinutes?: AlarmLeadMinutes;
  alarmMode?: AlarmMode;
  notificationId?: string | null;
}

// --- Date Helpers ---
const toDate = (isoDate: string) => new Date(isoDate + 'T00:00:00');
const isSameDay = (a: Date, b: Date) =>
  a.getFullYear() === b.getFullYear() &&
  a.getMonth() === b.getMonth() &&
  a.getDate() === b.getDate();
const formatYMD = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const formatShortDate = (d: Date) =>
  d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
const formatMonthYear = (d: Date) =>
  d.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });

// --- Helper Component: Swipeable Row ---
const SwipeableTask = ({
  children,
  onSwipeRight, // Delete
  onSwipeLeft, // Edit
}: {
  children: React.ReactNode;
  onSwipeRight: () => void;
  onSwipeLeft: () => void;
}) => {
  const pan = useRef(new Animated.ValueXY()).current;

  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, gestureState) => {
        return Math.abs(gestureState.dx) > 20 && Math.abs(gestureState.dy) < 20;
      },
      onPanResponderMove: Animated.event([null, { dx: pan.x }], { useNativeDriver: false }),
      onPanResponderRelease: (_, gestureState) => {
        if (gestureState.dx > SWIPE_THRESHOLD) {
          // Swiped Right -> Delete
          Animated.spring(pan, { toValue: { x: SCREEN_WIDTH, y: 0 }, useNativeDriver: false }).start(() => {
            onSwipeRight();
            pan.setValue({ x: 0, y: 0 }); 
          });
        } else if (gestureState.dx < -SWIPE_THRESHOLD) {
          // Swiped Left -> Edit
          Animated.spring(pan, { toValue: { x: -SCREEN_WIDTH, y: 0 }, useNativeDriver: false }).start(() => {
            onSwipeLeft();
            pan.setValue({ x: 0, y: 0 });
          });
        } else {
          // Return to center
          Animated.spring(pan, { toValue: { x: 0, y: 0 }, useNativeDriver: false }).start();
        }
      },
    })
  ).current;

  const rightOpacity = pan.x.interpolate({ inputRange: [0, SWIPE_THRESHOLD], outputRange: [0, 1] });
  const leftOpacity = pan.x.interpolate({ inputRange: [-SWIPE_THRESHOLD, 0], outputRange: [1, 0] });

  return (
    <View style={styles.swipeContainer}>
      <Animated.View style={[styles.swipeBg, styles.swipeBgDelete, { opacity: rightOpacity }]}>
        <Ionicons name="trash" size={24} color="#fff" />
        <Text style={styles.swipeText}>Delete</Text>
      </Animated.View>

      <Animated.View style={[styles.swipeBg, styles.swipeBgEdit, { opacity: leftOpacity }]}>
        <Text style={styles.swipeText}>Edit</Text>
        <Ionicons name="create" size={24} color="#fff" />
      </Animated.View>

      <Animated.View
        style={[styles.swipeForeground, { transform: [{ translateX: pan.x }] }]}
        {...panResponder.panHandlers}
      >
        {children}
      </Animated.View>
    </View>
  );
};

// --- Main Component ---
const PlannerScreen: React.FC = () => {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [currentMonth, setCurrentMonth] = useState<Date>(new Date());
  const [showCompleted, setShowCompleted] = useState(false);
  const [now, setNow] = useState(new Date());

  // Modal State
  const [modalVisible, setModalVisible] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);

  // Form Fields
  const [title, setTitle] = useState('');
  const [type, setType] = useState<TaskType>('task');
  const [startTime, setStartTime] = useState('');
  const [endTime, setEndTime] = useState('');
  const [notes, setNotes] = useState('');
  const [link, setLink] = useState('');
  const [associated, setAssociated] = useState('');
  const [repeat, setRepeat] = useState<RepeatRule>('none');
  const [formDate, setFormDate] = useState<Date>(selectedDate);
  const [alarmLead, setAlarmLead] = useState<AlarmLeadMinutes>(0);
  const [alarmMode, setAlarmMode] = useState<AlarmMode>('sound');

  // Pickers
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showTimePicker, setShowTimePicker] = useState(false);
  const [activeTimeField, setActiveTimeField] = useState<'start' | 'end'>('start');

  // --- Effects ---
  useEffect(() => {
    const interval = setInterval(() => setNow(new Date()), 60000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => { initTaskAlarms(); }, []);
  useEffect(() => {
    (async () => {
      try {
        const stored = await AsyncStorage.getItem(STORAGE_KEY);
        if (stored) setTasks(JSON.parse(stored));
      } catch (e) { console.log('Load error', e); }
    })();
  }, []);

  const saveTasks = async (next: Task[]) => {
    setTasks(next);
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  };

  const occursOnDate = (task: Task, dateStr: string): boolean => {
    const base = toDate(task.date);
    const current = toDate(dateStr);
    if (task.repeat === 'none') return isSameDay(base, current);
    if (current.getTime() < base.getTime()) return false;
    switch (task.repeat) {
      case 'daily': return true;
      case 'weekly': return base.getDay() === current.getDay();
      case 'monthly': return base.getDate() === current.getDate();
      case 'yearly': return base.getDate() === current.getDate() && base.getMonth() === current.getMonth();
      default: return false;
    }
  };

  // --- Filtering ---
  const dailyTasks = useMemo(() => {
    const dateStr = formatYMD(selectedDate);
    return tasks
      .filter((t) => occursOnDate(t, dateStr))
      .map((t) => {
        if (t.completedExceptions?.includes(dateStr)) {
            return { ...t, isCompleted: true };
        }
        return t;
      })
      .filter((t) => {
        if (showCompleted) return true;
        if (t.isCompleted) return false;
        
        const taskTime = t.startTime ? new Date(`${dateStr}T${t.startTime}:00`) : toDate(t.date);
        return taskTime >= now || isSameDay(toDate(t.date), now) || t.startTime === undefined;
      })
      .sort((a, b) => (a.startTime || '23:59').localeCompare(b.startTime || '23:59'));
  }, [tasks, selectedDate, showCompleted, now]);

  // --- Form Logic ---
  const openCreateModal = () => {
    setEditingTask(null);
    setTitle('');
    setType('task');
    const h = String(new Date().getHours()).padStart(2, '0');
    const m = String(new Date().getMinutes()).padStart(2, '0');
    setStartTime(`${h}:${m}`);
    setEndTime('');
    setNotes('');
    setLink('');
    setAssociated('');
    setRepeat('none');
    setFormDate(selectedDate);
    setAlarmLead(0);
    setAlarmMode('sound');
    setModalVisible(true);
  };

  const openEditModal = (task: Task) => {
    setEditingTask(task);
    setTitle(task.title);
    setType(task.type);
    setStartTime(task.startTime || '');
    setEndTime(task.endTime || '');
    setNotes(task.notes || '');
    setLink(task.link || '');
    setAssociated(task.associated || '');
    setRepeat(task.repeat);
    setFormDate(toDate(task.date));
    setAlarmLead(task.reminderLeadMinutes ?? 0);
    setAlarmMode(task.alarmMode ?? 'sound');
    setModalVisible(true);
  };

  const handleSave = async () => {
    if (!title.trim()) {
      Alert.alert('Missing Info', 'Please provide a title.');
      return;
    }
    const newTaskBase = {
      title: title.trim(),
      date: formatYMD(formDate),
      startTime: startTime || undefined,
      endTime: endTime || undefined,
      notes: notes || undefined,
      link: link || undefined,
      associated: associated || undefined,
      repeat,
      type,
      reminderLeadMinutes: alarmLead,
      alarmMode,
      updatedAt: new Date().toISOString(),
    };

    let updatedTasks = [...tasks];
    if (editingTask) {
      if (editingTask.notificationId) await cancelReminderById(editingTask.notificationId);
      const updated = { ...editingTask, ...newTaskBase };
      if (alarmLead > 0 && updated.startTime) {
        updated.notificationId = await scheduleTaskReminder(updated, { leadMinutes: alarmLead, mode: alarmMode });
      } else {
        updated.notificationId = null;
      }
      updatedTasks = tasks.map((t) => (t.id === editingTask.id ? updated : t));
    } else {
      const newId = Date.now().toString();
      let notifId = null;
      if (alarmLead > 0 && newTaskBase.startTime) {
        notifId = await scheduleTaskReminder({ id: newId, ...newTaskBase } as Task, { leadMinutes: alarmLead, mode: alarmMode });
      }
      updatedTasks.push({ id: newId, ...newTaskBase, isCompleted: false, createdAt: new Date().toISOString(), notificationId: notifId });
    }
    await saveTasks(updatedTasks);
    setModalVisible(false);
  };

  const handleDelete = async (task: Task) => {
    Alert.alert('Delete Task', 'Are you sure?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          if (task.notificationId) await cancelReminderById(task.notificationId);
          await saveTasks(tasks.filter((t) => t.id !== task.id));
        },
      },
    ]);
  };

  const toggleComplete = (task: Task) => {
    const todayStr = formatYMD(selectedDate);
    if (task.repeat === 'none') {
      saveTasks(
        tasks.map((t) => t.id === task.id ? { ...t, isCompleted: !t.isCompleted } : t)
      );
      return;
    }
    Alert.alert(
      'Complete Task',
      'Do you want to complete only this task or all upcoming tasks?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Only this task',
          onPress: () => {
            saveTasks(
              tasks.map((t) => t.id === task.id ? { ...t, completedExceptions: [...(t.completedExceptions || []), todayStr] } : t)
            );
          },
        },
        {
          text: 'All upcoming',
          style: 'destructive',
          onPress: () => {
            saveTasks(
              tasks.map((t) => t.id === task.id ? { ...t, isCompleted: true } : t)
            );
          },
        },
      ]
    );
  };

  const daysInMonth = new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 0).getDate();
  const firstDayIndex = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), 1).getDay();

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <View style={styles.headerTop}>
          <TouchableOpacity onPress={() => {
            const d = new Date(currentMonth);
            d.setMonth(d.getMonth() - 1);
            setCurrentMonth(d);
          }}>
            <Ionicons name="chevron-back" size={24} color={PRIMARY_COLOR} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>{formatMonthYear(currentMonth)}</Text>
          <TouchableOpacity onPress={() => {
            const d = new Date(currentMonth);
            d.setMonth(d.getMonth() + 1);
            setCurrentMonth(d);
          }}>
            <Ionicons name="chevron-forward" size={24} color={PRIMARY_COLOR} />
          </TouchableOpacity>
        </View>

        <View style={styles.calendarContainer}>
          <View style={styles.weekRow}>
            {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d, i) => (
              <Text key={i} style={styles.weekText}>{d}</Text>
            ))}
          </View>
          <View style={styles.daysGrid}>
             {Array.from({ length: firstDayIndex }).map((_, i) => (
               <View key={`empty-${i}`} style={styles.dayCell} />
             ))}
             {Array.from({ length: daysInMonth }).map((_, i) => {
               const day = i + 1;
               const cellDate = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), day);
               const isSelected = isSameDay(cellDate, selectedDate);
               const isToday = isSameDay(cellDate, new Date());
               const hasTask = tasks.some(t => occursOnDate(t, formatYMD(cellDate)) && !t.isCompleted);

               return (
                 <TouchableOpacity 
                    key={day} 
                    style={styles.dayCell} 
                    onPress={() => setSelectedDate(cellDate)}
                 >
                    <View style={[
                      styles.dayCircle, 
                      isSelected && styles.dayCircleSelected,
                      !isSelected && isToday && styles.dayCircleToday
                    ]}>
                      <Text style={[
                        styles.dayText, 
                        isSelected && styles.dayTextSelected,
                        !isSelected && isToday && styles.dayTextToday
                      ]}>
                        {day}
                      </Text>
                    </View>
                    {hasTask && !isSelected && <View style={styles.dot} />}
                 </TouchableOpacity>
               );
             })}
          </View>
        </View>
      </View>

      <View style={styles.listHeader}>
        <Text style={styles.listDateTitle}>{formatShortDate(selectedDate)}</Text>
        <View style={{flexDirection: 'row'}}>
            <TouchableOpacity onPress={() => setShowCompleted(!showCompleted)} style={{marginRight: 16}}>
                <Ionicons name={showCompleted ? "eye" : "eye-off"} size={22} color={PRIMARY_COLOR} />
            </TouchableOpacity>
            <TouchableOpacity onPress={openCreateModal}>
                <Ionicons name="add" size={24} color={PRIMARY_COLOR} />
            </TouchableOpacity>
        </View>
      </View>

      <ScrollView style={styles.taskList} contentContainerStyle={{paddingBottom: 40}}>
        {dailyTasks.length === 0 ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyText}>No events</Text>
          </View>
        ) : (
          dailyTasks.map((task) => (
            <SwipeableTask
              key={task.id}
              onSwipeRight={() => handleDelete(task)}
              onSwipeLeft={() => openEditModal(task)}
            >
              <View style={styles.taskRow}>
                <View style={styles.timeCol}>
                  <Text style={styles.timeText}>{task.startTime || 'All day'}</Text>
                </View>
                <View style={[styles.timelineLine, { backgroundColor: task.type === 'event' ? PRIMARY_COLOR : '#E5E5EA' }]} />
                <TouchableOpacity 
                    style={styles.taskContent} 
                    activeOpacity={0.8}
                    onPress={() => toggleComplete(task)}
                >
                  <Text style={[styles.taskTitle, task.isCompleted && styles.completedText]}>{task.title}</Text>
                  {(task.notes || task.reminderLeadMinutes) && (
                      <View style={styles.metaRow}>
                          {task.reminderLeadMinutes ? (
                              <Ionicons name="alarm" size={12} color="#8E8E93" style={{marginRight: 6}} />
                          ) : null}
                          {task.repeat !== 'none' && (
                              <Ionicons name="repeat" size={12} color="#8E8E93" style={{marginRight: 6}} />
                          )}
                          <Text style={styles.notesText} numberOfLines={1}>
                            {task.notes || task.associated || (task.link ? 'Has link' : '')}
                          </Text>
                      </View>
                  )}
                </TouchableOpacity>
              </View>
            </SwipeableTask>
          ))
        )}
      </ScrollView>

      {/* --- MODAL (UPDATED WITH SAFE AREA) --- */}
      <Modal visible={modalVisible} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setModalVisible(false)}>
        <SafeAreaView style={{ flex: 1, backgroundColor: '#F2F2F7' }}> 
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{flex: 1}}>
            <View style={styles.modalNav}>
              <TouchableOpacity onPress={() => setModalVisible(false)}>
                <Text style={styles.navCancel}>Cancel</Text>
              </TouchableOpacity>
              <Text style={styles.navTitle}>{editingTask ? 'Edit' : 'New Event'}</Text>
              <TouchableOpacity onPress={handleSave}>
                <Text style={styles.navDone}>Done</Text>
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.formScroll}>
              <View style={styles.formGroup}>
                <TextInput 
                  style={styles.inputField} 
                  placeholder="Title" 
                  value={title} 
                  onChangeText={setTitle} 
                  placeholderTextColor="#C7C7CC"
                />
                <View style={styles.divider} />
                <View style={styles.rowItem}>
                   <Text style={styles.rowLabel}>Type</Text>
                   <View style={styles.segmentContainer}>
                      {['task', 'event'].map((t) => (
                          <TouchableOpacity 
                              key={t} 
                              style={[styles.segmentBtn, type === t && styles.segmentBtnActive]}
                              onPress={() => setType(t as TaskType)}
                          >
                              <Text style={[styles.segmentText, type === t && styles.segmentTextActive]}>
                                  {t === 'task' ? 'Task' : 'Event'}
                              </Text>
                          </TouchableOpacity>
                      ))}
                   </View>
                </View>
              </View>

              <View style={styles.formGroup}>
                  <TouchableOpacity style={styles.rowItem} onPress={() => setShowDatePicker(true)}>
                      <Text style={styles.rowLabel}>Date</Text>
                      <Text style={styles.rowValue}>{formatShortDate(formDate)}</Text>
                  </TouchableOpacity>
                  <View style={styles.divider} />
                  
                  <View style={styles.rowItem}>
                      <Text style={styles.rowLabel}>Start</Text>
                      <TouchableOpacity onPress={() => { setActiveTimeField('start'); setShowTimePicker(true); }}>
                            <Text style={styles.rowValueTime}>{startTime || 'None'}</Text>
                      </TouchableOpacity>
                  </View>
                  <View style={styles.divider} />

                  <View style={styles.rowItem}>
                      <Text style={styles.rowLabel}>End</Text>
                      <TouchableOpacity onPress={() => { setActiveTimeField('end'); setShowTimePicker(true); }}>
                            <Text style={styles.rowValueTime}>{endTime || 'None'}</Text>
                      </TouchableOpacity>
                  </View>
              </View>

              <View style={styles.formGroup}>
                  <View style={styles.rowItem}>
                      <Text style={styles.rowLabel}>Repeat</Text>
                      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{flexDirection:'row', alignItems:'center'}}>
                          {['none','daily','weekly','monthly'].map(r => (
                              <TouchableOpacity key={r} onPress={() => setRepeat(r as RepeatRule)} style={{marginLeft: 8}}>
                                  <Text style={{color: repeat === r ? PRIMARY_COLOR : '#8E8E93', fontSize: 15, textTransform: 'capitalize'}}>
                                      {r}
                                  </Text>
                              </TouchableOpacity>
                          ))}
                      </ScrollView>
                  </View>
                  <View style={styles.divider} />
                  
                  <View style={styles.rowItem}>
                      <Text style={styles.rowLabel}>Alert</Text>
                      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                          {[0, 5, 10, 30, 60].map(m => (
                              <TouchableOpacity key={m} onPress={() => setAlarmLead(m as AlarmLeadMinutes)} style={{marginLeft: 10, backgroundColor: alarmLead === m ? PRIMARY_COLOR : '#E5E5EA', borderRadius: 6, padding: 4}}>
                                  <Text style={{color: alarmLead === m ? '#fff' : '#000', fontSize: 12}}>
                                      {m === 0 ? 'None' : `${m}m`}
                                  </Text>
                              </TouchableOpacity>
                          ))}
                      </ScrollView>
                  </View>

                  {alarmLead > 0 && (
                      <>
                          <View style={styles.divider} />
                          <View style={styles.rowItem}>
                              <Text style={styles.rowLabel}>Sound</Text>
                              <View style={{flexDirection:'row'}}>
                                  {(['sound', 'vibrate', 'silent'] as AlarmMode[]).map(m => (
                                      <TouchableOpacity key={m} onPress={() => setAlarmMode(m)} style={{marginLeft: 12}}>
                                          <Ionicons 
                                              name={m === 'sound' ? 'musical-note' : m === 'vibrate' ? 'phone-portrait' : 'notifications-off'} 
                                              size={20} 
                                              color={alarmMode === m ? PRIMARY_COLOR : '#C7C7CC'} 
                                          />
                                      </TouchableOpacity>
                                  ))}
                              </View>
                          </View>
                      </>
                  )}
              </View>

              <View style={styles.formGroup}>
                  <TextInput 
                      style={[styles.inputField, { height: 80, textAlignVertical: 'top' }]} 
                      placeholder="Notes" 
                      value={notes} 
                      onChangeText={setNotes} 
                      multiline 
                      placeholderTextColor="#C7C7CC"
                  />
                  <View style={styles.divider} />
                  <TextInput 
                      style={styles.inputField} 
                      placeholder="URL / Link" 
                      value={link} 
                      onChangeText={setLink} 
                      autoCapitalize="none"
                      placeholderTextColor="#C7C7CC"
                  />
                  <View style={styles.divider} />
                  <TextInput 
                      style={styles.inputField} 
                      placeholder="Tag User (Associated)" 
                      value={associated} 
                      onChangeText={setAssociated} 
                      placeholderTextColor="#C7C7CC"
                  />
              </View>

              <View style={{height: 100}} />
            </ScrollView>
          </KeyboardAvoidingView>
        </SafeAreaView>

        {showDatePicker && (
          <DateTimePicker 
            value={formDate} 
            mode="date" 
            display="spinner"
            onChange={(_, d) => {
                 if (Platform.OS !== 'ios') setShowDatePicker(false);
                 if (d) setFormDate(d);
            }} 
          />
        )}
        {showTimePicker && (
          <DateTimePicker 
            value={new Date()} 
            mode="time" 
            display="spinner"
            onChange={(_, d) => {
                if (Platform.OS !== 'ios') setShowTimePicker(false);
                if (d) {
                    const t = `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
                    if (activeTimeField === 'start') setStartTime(t);
                    else setEndTime(t);
                }
            }} 
          />
        )}
      </Modal>
    </View>
  );
};

export default PlannerScreen;

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#fff' },
  
  // Header / Calendar
  header: { paddingTop: 60, paddingBottom: 10, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#E5E5EA' },
  headerTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, marginBottom: 15 },
  headerTitle: { fontSize: 18, fontWeight: '600', color: '#000' },
  
  calendarContainer: { paddingHorizontal: 10 },
  weekRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
  weekText: { width: `${100/7}%`, textAlign: 'center', fontSize: 11, fontWeight: '600', color: '#8E8E93' },
  
  daysGrid: { flexDirection: 'row', flexWrap: 'wrap' },
  dayCell: { width: `${100/7}%`, aspectRatio: 1, alignItems: 'center', justifyContent: 'center' },
  dayCircle: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  dayCircleSelected: { backgroundColor: '#000' },
  dayCircleToday: { backgroundColor: ACCENT_COLOR },
  
  dayText: { fontSize: 16, color: '#000' },
  dayTextSelected: { color: '#fff', fontWeight: '600' },
  dayTextToday: { color: '#fff', fontWeight: '600' },
  
  dot: { width: 4, height: 4, borderRadius: 2, backgroundColor: '#C7C7CC', marginTop: 2 },

  // List
  listHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 15, backgroundColor: '#F2F2F7' },
  listDateTitle: { fontSize: 18, fontWeight: '700', color: '#000' },
  
  taskList: { flex: 1, backgroundColor: '#fff' },
  emptyState: { marginTop: 50, alignItems: 'center' },
  emptyText: { color: '#8E8E93', fontSize: 16 },

  // Swipeable Task
  swipeContainer: { height: 70, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#E5E5EA' },
  swipeBg: { position: 'absolute', top: 0, bottom: 0, width: SCREEN_WIDTH, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20 },
  swipeBgDelete: { backgroundColor: ACCENT_COLOR, justifyContent: 'flex-start' }, 
  
  swipeBgEdit: { backgroundColor: PRIMARY_COLOR, justifyContent: 'flex-end', right: 0 },
  swipeText: { color: '#fff', fontWeight: '600', paddingHorizontal: 8 },
  
  swipeForeground: { flexDirection: 'row', alignItems: 'center', height: '100%', backgroundColor: '#fff' },

  taskRow: { flexDirection: 'row', flex: 1, paddingRight: 20 },
  timeCol: { width: 70, alignItems: 'flex-end', justifyContent: 'flex-start', paddingTop: 14, paddingRight: 10 },
  timeText: { fontSize: 13, fontWeight: '500', color: '#000' },
  
  timelineLine: { width: 2, backgroundColor: '#E5E5EA', height: '100%', marginHorizontal: 4, borderRadius: 1 },
  
  taskContent: { flex: 1, justifyContent: 'center', paddingLeft: 10 },
  taskTitle: { fontSize: 16, fontWeight: '500', color: '#000', marginBottom: 2 },
  completedText: { textDecorationLine: 'line-through', color: '#8E8E93' },
  metaRow: { flexDirection: 'row', alignItems: 'center' },
  notesText: { fontSize: 12, color: '#8E8E93' },

  // Modal (Apple Form)
  modalNav: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, backgroundColor: '#F2F2F7' },
  navCancel: { fontSize: 17, color: PRIMARY_COLOR },
  navTitle: { fontSize: 17, fontWeight: '600' },
  navDone: { fontSize: 17, fontWeight: '600', color: PRIMARY_COLOR },
  
  formScroll: { flex: 1 },
  formGroup: { backgroundColor: '#fff', borderRadius: 10, marginHorizontal: 16, marginTop: 20, paddingLeft: 16, overflow: 'hidden' },
  inputField: { fontSize: 17, height: 48, color: '#000', paddingRight: 16 },
  divider: { height: 1, backgroundColor: '#E5E5EA' },
  
  rowItem: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', height: 48, paddingRight: 16 },
  rowLabel: { fontSize: 16, color: '#000' },
  rowValue: { fontSize: 16, color: PRIMARY_COLOR },
  rowValueTime: { fontSize: 17, color: '#000', backgroundColor: '#F2F2F7', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6, overflow: 'hidden' },

  segmentContainer: { flexDirection: 'row', backgroundColor: '#E5E5EA', borderRadius: 8, padding: 2 },
  segmentBtn: { paddingVertical: 4, paddingHorizontal: 12, borderRadius: 6 },
  segmentBtnActive: { backgroundColor: '#fff', shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 2 },
  segmentText: { fontSize: 13, fontWeight: '500' },
  segmentTextActive: { fontWeight: '600' }
});