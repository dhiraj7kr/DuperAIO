import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import DateTimePicker from '@react-native-community/datetimepicker';
import React, { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View
} from 'react-native';
import { theme } from '../theme/theme';
import {
  AlarmLeadMinutes,
  AlarmMode,
  cancelReminderById,
  initTaskAlarms,
  scheduleTaskReminder
} from '../utils/alarmManager';

// --- Types ---
type RepeatRule = 'none' | 'daily' | 'weekly' | 'monthly' | 'yearly';
type TaskType = 'task' | 'event';

interface Task {
  id: string;
  title: string;
  date: string; // base date: 'YYYY-MM-DD'
  startTime?: string;
  endTime?: string;
  notes?: string;
  link?: string;
  associated?: string;
  isCompleted: boolean;
  repeat: RepeatRule;
  type: TaskType;
  createdAt: string;
  updatedAt: string;

  // Alarm-related fields
  reminderLeadMinutes?: AlarmLeadMinutes;
  alarmMode?: AlarmMode;
  notificationId?: string | null;
}

const STORAGE_KEY = 'plannerTasks_v2';

// --- Date helpers ---
const toDate = (isoDate: string) => new Date(isoDate + 'T00:00:00');

const isSameDay = (a: Date, b: Date) =>
  a.getFullYear() === b.getFullYear() &&
  a.getMonth() === b.getMonth() &&
  a.getDate() === b.getDate();

const formatYMD = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

const formatShortDate = (d: Date) =>
  d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });

const formatDateLabel = (d: Date) =>
  d.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

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

const PlannerScreen: React.FC = () => {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [currentMonth, setCurrentMonth] = useState<Date>(new Date());
  const [showCompleted, setShowCompleted] = useState(false);
  const [viewMode, setViewMode] = useState<'day' | 'week' | 'month'>('day');
  
  // Real-time ticker to auto-hide past tasks
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

  // Pickers State
  const [formDate, setFormDate] = useState<Date>(selectedDate);
  const [showDatePicker, setShowDatePicker] = useState(false);
  
  // Time Picker State
  const [showTimePicker, setShowTimePicker] = useState(false);
  const [activeTimeField, setActiveTimeField] = useState<'start' | 'end'>('start');

  // Alarm Form State
  const [alarmLead, setAlarmLead] = useState<AlarmLeadMinutes>(0);
  const [alarmMode, setAlarmMode] = useState<AlarmMode>('sound');

  // Update 'now' every minute to ensure past tasks disappear automatically
  useEffect(() => {
    const interval = setInterval(() => setNow(new Date()), 60000); // 60s
    return () => clearInterval(interval);
  }, []);

  useEffect(() => { initTaskAlarms(); }, []);
  useEffect(() => {
    (async () => {
      try {
        const stored = await AsyncStorage.getItem(STORAGE_KEY);
        if (stored) setTasks(JSON.parse(stored));
      } catch (e) { console.log('Failed to load tasks', e); }
    })();
  }, []);

  const saveTasks = async (next: Task[]) => {
    try {
      setTasks(next);
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch (e) { console.log('Failed to save tasks', e); }
  };

  // --- Helpers for Time ---
  const getCurrentTime = () => {
    const d = new Date();
    const hh = String(d.getHours()).padStart(2, '0');
    const mm = String(d.getMinutes()).padStart(2, '0');
    return `${hh}:${mm}`;
  };

  // --- Filtering Logic (The Magic happens here) ---
  const isTaskInPast = (task: Task) => {
    const taskDate = toDate(task.date);
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // 1. If date is strictly before today -> Past
    if (taskDate < today) return true;

    // 2. If date is today, check Time
    if (taskDate.getTime() === today.getTime() && task.startTime) {
      const [h, m] = task.startTime.split(':').map(Number);
      const taskTime = new Date();
      taskTime.setHours(h, m, 0, 0);
      
      // If task time is before current time (now) -> Past
      if (taskTime < new Date()) return true;
    }

    return false;
  };

  const tasksForView = useMemo(() => {
    // Filter out Completed AND Past tasks unless 'showCompleted' is true
    const activeTasks = tasks.filter(t => {
      if (showCompleted) return true; // Show everything if Eye is on
      
      // If completed -> Hide
      if (t.isCompleted) return false;

      // If past (time passed) -> Hide
      if (isTaskInPast(t)) return false;

      return true;
    });

    if (viewMode === 'day') {
      return activeTasks.filter((t) => occursOnDate(t, formatYMD(selectedDate)));
    }
    
    // Week / Month Logic
    const resultMap = new Map<string, Task>();
    const rangeStart = viewMode === 'week' 
      ? new Date(new Date(selectedDate).setDate(selectedDate.getDate() - selectedDate.getDay())) 
      : new Date(selectedDate.getFullYear(), selectedDate.getMonth(), 1);
    
    const daysToCheck = viewMode === 'week' ? 7 : new Date(selectedDate.getFullYear(), selectedDate.getMonth() + 1, 0).getDate();

    for (let i = 0; i < daysToCheck; i++) {
      const d = new Date(rangeStart);
      d.setDate(rangeStart.getDate() + i);
      const dStr = formatYMD(d);
      activeTasks.forEach((t) => {
        if (occursOnDate(t, dStr)) resultMap.set(t.id, t);
      });
    }
    return Array.from(resultMap.values()).sort((a, b) => a.date.localeCompare(b.date));
  }, [tasks, selectedDate, viewMode, showCompleted, now]); // Added 'now' dependency to trigger re-render

  // --- Navigation ---
  const changeMonth = (direction: 'prev' | 'next') => {
    const newDate = new Date(currentMonth);
    newDate.setMonth(currentMonth.getMonth() + (direction === 'prev' ? -1 : 1));
    setCurrentMonth(newDate);
  };
  const onSelectDay = (day: number) => {
    setSelectedDate(new Date(currentMonth.getFullYear(), currentMonth.getMonth(), day));
  };
  const hasTasksOnDate = (dateStr: string) => tasks.some((t) => occursOnDate(t, dateStr) && !t.isCompleted);

  // --- Calendar Data ---
  const monthLabel = useMemo(() => currentMonth.toLocaleDateString(undefined, { month: 'long', year: 'numeric' }), [currentMonth]);
  const daysInMonth = useMemo(() => new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 0).getDate(), [currentMonth]);
  const firstDayOfMonth = useMemo(() => new Date(currentMonth.getFullYear(), currentMonth.getMonth(), 1).getDay(), [currentMonth]);

  // --- Form Handlers ---
  const openCreateModal = () => {
    setEditingTask(null);
    setTitle('');
    setType('task');
    // FIX: Set Start Time to Current Time automatically
    setStartTime(getCurrentTime());
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

  const openTimePicker = (field: 'start' | 'end') => {
    setActiveTimeField(field);
    setShowTimePicker(true);
  };

  const onTimeChange = (event: any, date?: Date) => {
    if (Platform.OS === 'android') setShowTimePicker(false);
    if (date) {
      const timeStr = `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
      if (activeTimeField === 'start') {
        setStartTime(timeStr);
      } else {
        setEndTime(timeStr);
      }
    }
  };

  const handleSave = async () => {
    if (!title.trim()) {
      Alert.alert('Required', 'Please enter a title');
      return;
    }

    const nowIso = new Date().toISOString();
    const baseDateStr = formatYMD(formDate);
    const newTaskBase = {
      title: title.trim(),
      date: baseDateStr,
      startTime: startTime || undefined,
      endTime: endTime || undefined,
      notes: notes || undefined,
      link: link || undefined,
      associated: associated || undefined,
      repeat,
      type,
      reminderLeadMinutes: alarmLead,
      alarmMode,
      updatedAt: nowIso,
    };

    let updatedTasks = [...tasks];

    if (editingTask) {
      const updated = { ...editingTask, ...newTaskBase };
      if (editingTask.notificationId) {
        await cancelReminderById(editingTask.notificationId);
        updated.notificationId = null;
      }
      if (alarmLead > 0 && updated.startTime) {
        updated.notificationId = await scheduleTaskReminder(
          { id: updated.id, title: updated.title, date: updated.date, startTime: updated.startTime },
          { leadMinutes: alarmLead, mode: alarmMode }
        );
      }
      updatedTasks = tasks.map((t) => (t.id === editingTask.id ? updated : t));
    } else {
      const newTaskId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      let notificationId: string | null = null;
      if (alarmLead > 0 && newTaskBase.startTime) {
        notificationId = await scheduleTaskReminder(
          { id: newTaskId, title: newTaskBase.title, date: newTaskBase.date, startTime: newTaskBase.startTime! },
          { leadMinutes: alarmLead, mode: alarmMode }
        );
      }
      const newTask: Task = { id: newTaskId, ...newTaskBase, isCompleted: false, createdAt: nowIso, notificationId };
      updatedTasks.push(newTask);
    }

    await saveTasks(updatedTasks);
    setModalVisible(false);
  };

  const toggleComplete = (task: Task) => {
    const next = tasks.map((t) => t.id === task.id ? { ...t, isCompleted: !t.isCompleted } : t);
    saveTasks(next);
  };

  const deleteTask = async (task: Task) => {
    if (task.notificationId) await cancelReminderById(task.notificationId);
    const next = tasks.filter((t) => t.id !== task.id);
    saveTasks(next);
  };

  return (
    <View style={styles.screen}>
      <ScrollView style={styles.container} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Planner</Text>
          <Text style={styles.headerSub}>Calendar & tasks, connected to your day.</Text>
        </View>

        <View style={styles.monthRow}>
          <TouchableOpacity style={styles.monthNavButton} onPress={() => changeMonth('prev')}>
            <Ionicons name="chevron-back" size={18} color={theme.colors.text} />
          </TouchableOpacity>
          <Text style={styles.monthLabel}>{monthLabel}</Text>
          <TouchableOpacity style={styles.monthNavButton} onPress={() => changeMonth('next')}>
            <Ionicons name="chevron-forward" size={18} color={theme.colors.text} />
          </TouchableOpacity>
        </View>

        <View style={styles.weekDaysRow}>
          {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d, index) => (
            <Text key={`${d}-${index}`} style={styles.weekDay}>{d}</Text>
          ))}
        </View>
        <View style={styles.calendarGrid}>
          {Array.from({ length: firstDayOfMonth }).map((_, idx) => <View key={`empty-${idx}`} style={styles.calendarCell} />)}
          {Array.from({ length: daysInMonth }).map((_, index) => {
            const day = index + 1;
            const dateStr = `${currentMonth.getFullYear()}-${String(currentMonth.getMonth() + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
            const cellDate = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), day);
            const selected = isSameDay(cellDate, selectedDate);
            const today = isSameDay(cellDate, new Date());
            const has = hasTasksOnDate(dateStr);

            return (
              <TouchableOpacity key={`day-${day}`} style={[styles.calendarCell, selected && styles.calendarCellSelected]} onPress={() => onSelectDay(day)}>
                <Text style={[styles.calendarDayText, selected && styles.calendarDayTextSelected]}>{day}</Text>
                {today && !selected && <View style={styles.todayDot} />}
                {has && <View style={[styles.taskDot, selected && styles.taskDotSelected]} />}
              </TouchableOpacity>
            );
          })}
        </View>

        <View style={styles.viewModeRow}>
          {(['day', 'week', 'month'] as const).map((mode) => (
            <TouchableOpacity key={mode} style={[styles.viewModeChip, viewMode === mode && styles.viewModeChipSelected]} onPress={() => setViewMode(mode)}>
              <Text style={[styles.viewModeChipText, viewMode === mode && styles.viewModeChipTextSelected]}>
                {mode === 'day' ? 'Daily' : mode === 'week' ? 'Weekly' : 'Monthly'}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <View style={styles.tasksSection}>
          <View style={styles.tasksHeaderRow}>
            <View>
              <Text style={styles.tasksTitle}>Tasks & events</Text>
              <Text style={styles.tasksDateLabel}>
                {viewMode === 'day' ? formatDateLabel(selectedDate) : viewMode === 'week' ? 'This week' : 'This month'}
              </Text>
            </View>
            <View style={{flexDirection: 'row', alignItems: 'center'}}>
              <TouchableOpacity style={[styles.iconButton, { marginRight: 8 }]} onPress={() => setShowCompleted(!showCompleted)}>
                <Ionicons name={showCompleted ? "eye-off-outline" : "eye-outline"} size={22} color={showCompleted ? theme.colors.primary : "#94A3B8"} />
              </TouchableOpacity>
              <TouchableOpacity style={styles.addTaskButton} onPress={openCreateModal}>
                <Ionicons name="add" size={18} color="#fff" />
                <Text style={styles.addTaskButtonText}>Add</Text>
              </TouchableOpacity>
            </View>
          </View>

          {tasksForView.length === 0 ? (
            <View style={styles.emptyState}>
              <Text style={styles.emptyTitle}>{showCompleted ? "History empty" : "No active tasks"}</Text>
              <Text style={styles.emptySubtitle}>
                {showCompleted ? "No completed or past tasks." : "Tap + to add a task, or tap the eye icon to see history."}
              </Text>
            </View>
          ) : (
            tasksForView.map((task) => (
              <TouchableOpacity key={task.id} style={styles.taskCard} onPress={() => openEditModal(task)}>
                <View style={styles.taskLeft}>
                  <TouchableOpacity onPress={() => toggleComplete(task)} style={[styles.checkbox, task.isCompleted && styles.checkboxChecked]}>
                    {task.isCompleted && <Ionicons name="checkmark" size={14} color="#fff" />}
                  </TouchableOpacity>
                  <View style={styles.taskTextBlock}>
                    <Text style={[styles.taskTitle, task.isCompleted && styles.taskTitleCompleted]}>{task.title}</Text>
                    <View style={styles.taskMetaRow}>
                      <Text style={styles.taskMeta}>
                        {formatShortDate(toDate(task.date))}
                        {task.startTime ? ` · ${task.startTime}` : ''}
                      </Text>
                      <Text style={styles.taskMeta}>{'  · '}{task.type === 'task' ? 'Task' : 'Event'}</Text>
                      {task.repeat !== 'none' && <Text style={styles.taskMeta}>{'  · '}{task.repeat}</Text>}
                    </View>
                    {task.notes ? <Text style={styles.taskNotes} numberOfLines={2}>{task.notes}</Text> : null}
                    {task.link ? <Text style={styles.taskMeta} numberOfLines={1}>🔗 {task.link}</Text> : null}
                    {task.associated ? <Text style={styles.taskMeta} numberOfLines={1}>👤 {task.associated}</Text> : null}
                  </View>
                </View>
                <TouchableOpacity style={styles.deleteButton} onPress={() => deleteTask(task)}>
                  <Ionicons name="trash-outline" size={18} color="#ef4444" />
                </TouchableOpacity>
              </TouchableOpacity>
            ))
          )}
        </View>
      </ScrollView>

      {/* --- MODAL --- */}
      <Modal visible={modalVisible} animationType="slide" transparent onRequestClose={() => setModalVisible(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.modalOverlay}>
          <View style={styles.modalContainer}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{editingTask ? 'Edit Task' : 'New Task'}</Text>
              <TouchableOpacity onPress={() => setModalVisible(false)}>
                <Ionicons name="close" size={24} color="#64748B" />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.formScroll} contentContainerStyle={styles.formScrollContent} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
              <Text style={styles.modalLabel}>Title</Text>
              <TextInput style={styles.input} value={title} onChangeText={setTitle} placeholder="What needs to be done?" placeholderTextColor={theme.colors.textSecondary} />

              <Text style={styles.modalLabel}>Type</Text>
              <View style={styles.chipRow}>
                {(['task', 'event'] as TaskType[]).map((t) => (
                  <TouchableOpacity key={t} style={[styles.chip, type === t && styles.chipSelected]} onPress={() => setType(t)}>
                    <Text style={[styles.chipText, type === t && styles.chipTextSelected]}>{t === 'task' ? 'Task' : 'Event'}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={styles.modalLabel}>Date</Text>
              <TouchableOpacity style={styles.inputLikeButton} onPress={() => setShowDatePicker(true)}>
                <Ionicons name="calendar-outline" size={20} color="#64748B" style={{ marginRight: 8 }} />
                <Text style={styles.inputLikeButtonText}>{formatShortDate(formDate)}</Text>
              </TouchableOpacity>

              {/* TIME PICKERS */}
              <View style={styles.row}>
                <View style={[styles.rowItem, { marginRight: 8 }]}>
                  <Text style={styles.modalLabel}>Start Time</Text>
                  <TouchableOpacity style={styles.inputLikeButton} onPress={() => openTimePicker('start')}>
                    <Ionicons name="time-outline" size={20} color="#64748B" style={{ marginRight: 8 }} />
                    <Text style={styles.inputLikeButtonText}>{startTime || 'Set time'}</Text>
                  </TouchableOpacity>
                </View>
                <View style={[styles.rowItem, { marginLeft: 8 }]}>
                  <Text style={styles.modalLabel}>End Time</Text>
                  <TouchableOpacity style={styles.inputLikeButton} onPress={() => openTimePicker('end')}>
                    <Ionicons name="time-outline" size={20} color="#64748B" style={{ marginRight: 8 }} />
                    <Text style={styles.inputLikeButtonText}>{endTime || 'Set time'}</Text>
                  </TouchableOpacity>
                </View>
              </View>

              <Text style={styles.modalLabel}>Repeat</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                <View style={styles.chipRow}>
                  {(['none', 'daily', 'weekly', 'monthly', 'yearly'] as RepeatRule[]).map((r) => (
                    <TouchableOpacity key={r} style={[styles.chip, repeat === r && styles.chipSelected]} onPress={() => setRepeat(r)}>
                      <Text style={[styles.chipText, repeat === r && styles.chipTextSelected]}>{r === 'none' ? 'No repeat' : r.charAt(0).toUpperCase() + r.slice(1)}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </ScrollView>

              <Text style={styles.modalLabel}>Reminder</Text>
              <View style={styles.chipRow}>
                {[0, 5, 30].map((m) => (
                  <TouchableOpacity key={m} style={[styles.chip, alarmLead === (m as AlarmLeadMinutes) && styles.chipSelected]} onPress={() => setAlarmLead(m as AlarmLeadMinutes)}>
                    <Text style={[styles.chipText, alarmLead === (m as AlarmLeadMinutes) && styles.chipTextSelected]}>{m === 0 ? 'None' : `${m} min before`}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={styles.modalLabel}>Alarm Mode</Text>
              <View style={styles.chipRow}>
                {(['silent', 'vibrate', 'sound'] as AlarmMode[]).map((mode) => (
                  <TouchableOpacity key={mode} style={[styles.chip, alarmMode === mode && styles.chipSelected]} onPress={() => setAlarmMode(mode)}>
                    <Text style={[styles.chipText, alarmMode === mode && styles.chipTextSelected]}>
                      {mode === 'silent' ? 'Silent' : mode === 'vibrate' ? 'Vibrate' : 'Sound'}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={styles.modalLabel}>Description</Text>
              <TextInput style={[styles.input, styles.notesInput]} value={notes} onChangeText={setNotes} placeholder="Details, context..." placeholderTextColor={theme.colors.textSecondary} multiline />

              <Text style={styles.modalLabel}>Link</Text>
              <TextInput style={styles.input} value={link} onChangeText={setLink} placeholder="https://..." placeholderTextColor={theme.colors.textSecondary} />

              <Text style={styles.modalLabel}>Associated (Person/Project)</Text>
              <TextInput style={styles.input} value={associated} onChangeText={setAssociated} placeholder="e.g. Client Name" placeholderTextColor={theme.colors.textSecondary} />
              
              <View style={{ height: 40 }} />
            </ScrollView>

            <View style={styles.modalButtonsRow}>
              <TouchableOpacity style={[styles.modalButton, styles.modalButtonSecondary]} onPress={() => setModalVisible(false)}>
                <Text style={styles.modalButtonSecondaryText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.modalButton, styles.modalButtonPrimary]} onPress={handleSave}>
                <Text style={styles.modalButtonPrimaryText}>{editingTask ? 'Save Changes' : 'Create Task'}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>

        {showDatePicker && (
          <DateTimePicker value={formDate} mode="date" display={Platform.OS === 'ios' ? 'spinner' : 'default'} onChange={(event: any, date?: Date) => { if (Platform.OS === 'android') setShowDatePicker(false); if (date) setFormDate(date); }} />
        )}
        
        {/* TIME PICKER (Reused for Start and End) */}
        {showTimePicker && (
          <DateTimePicker 
            value={new Date()} // Always opens at current time
            mode="time" 
            is24Hour={false} 
            display={Platform.OS === 'ios' ? 'spinner' : 'default'} 
            onChange={onTimeChange} 
          />
        )}
      </Modal>
    </View>
  );
};

export default PlannerScreen;

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: theme.colors.background },
  container: { flex: 1 },
  scrollContent: { paddingHorizontal: theme.spacing(2), paddingTop: theme.spacing(14), paddingBottom: theme.spacing(4) },
  header: { marginBottom: theme.spacing(2) },
  headerTitle: { fontSize: theme.fontSize.xl, fontWeight: '700', color: theme.colors.text },
  headerSub: { fontSize: theme.fontSize.sm, color: theme.colors.textSecondary, marginTop: 2 },
  monthRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: theme.spacing(1) },
  monthLabel: { fontSize: theme.fontSize.lg, fontWeight: '600', color: theme.colors.text },
  monthNavButton: { width: 32, height: 32, borderRadius: 16, borderWidth: 1, borderColor: theme.colors.border, alignItems: 'center', justifyContent: 'center' },
  weekDaysRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 },
  weekDay: { flex: 1, textAlign: 'center', fontSize: theme.fontSize.xs, color: theme.colors.textSecondary },
  calendarGrid: { flexDirection: 'row', flexWrap: 'wrap', marginBottom: theme.spacing(2) },
  calendarCell: { width: `${100 / 7}%`, aspectRatio: 1.1, alignItems: 'center', justifyContent: 'center', marginVertical: 2 },
  calendarCellSelected: { backgroundColor: '#E0ECFF', borderRadius: 999 },
  calendarDayText: { fontSize: theme.fontSize.sm, color: theme.colors.text },
  calendarDayTextSelected: { fontWeight: '700', color: theme.colors.primary },
  todayDot: { width: 4, height: 4, borderRadius: 2, backgroundColor: theme.colors.primary, marginTop: 2 },
  taskDot: { width: 4, height: 4, borderRadius: 2, backgroundColor: '#9CA3AF', marginTop: 2 },
  taskDotSelected: { backgroundColor: theme.colors.primaryDark },
  viewModeRow: { flexDirection: 'row', marginBottom: theme.spacing(1) },
  viewModeChip: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999, borderWidth: 1, borderColor: theme.colors.border, marginRight: 8 },
  viewModeChipSelected: { backgroundColor: '#E0ECFF', borderColor: theme.colors.primary },
  viewModeChipText: { fontSize: theme.fontSize.xs, color: theme.colors.textSecondary },
  viewModeChipTextSelected: { color: theme.colors.primary, fontWeight: '600' },
  tasksSection: { marginTop: theme.spacing(1) },
  tasksHeaderRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: theme.spacing(1) },
  tasksTitle: { fontSize: theme.fontSize.base, fontWeight: '600', color: theme.colors.text },
  tasksDateLabel: { fontSize: theme.fontSize.xs, color: theme.colors.textSecondary },
  iconButton: { padding: 8 },
  addTaskButton: { flexDirection: 'row', alignItems: 'center', backgroundColor: theme.colors.primary, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999 },
  addTaskButtonText: { color: '#fff', marginLeft: 4, fontSize: theme.fontSize.xs, fontWeight: '600' },
  emptyState: { marginTop: theme.spacing(2), padding: theme.spacing(2), borderRadius: theme.radius.lg, backgroundColor: theme.colors.card, borderWidth: 1, borderColor: theme.colors.border },
  emptyTitle: { fontSize: theme.fontSize.sm, fontWeight: '600', color: theme.colors.text },
  emptySubtitle: { fontSize: theme.fontSize.xs, color: theme.colors.textSecondary, marginTop: 2 },
  taskCard: { flexDirection: 'row', alignItems: 'flex-start', backgroundColor: theme.colors.card, padding: theme.spacing(1.5), borderRadius: theme.radius.lg, borderWidth: 1, borderColor: theme.colors.border, marginTop: theme.spacing(1) },
  taskLeft: { flexDirection: 'row', flex: 1 },
  checkbox: { width: 22, height: 22, borderRadius: 6, borderWidth: 1.5, borderColor: theme.colors.border, alignItems: 'center', justifyContent: 'center', marginRight: theme.spacing(1) },
  checkboxChecked: { backgroundColor: theme.colors.primary, borderColor: theme.colors.primary },
  taskTextBlock: { flex: 1 },
  taskTitle: { fontSize: theme.fontSize.sm, fontWeight: '600', color: theme.colors.text },
  taskTitleCompleted: { textDecorationLine: 'line-through', color: theme.colors.textSecondary },
  taskMetaRow: { flexDirection: 'row', flexWrap: 'wrap', marginTop: 2 },
  taskMeta: { fontSize: theme.fontSize.xs, color: theme.colors.textSecondary },
  taskNotes: { fontSize: theme.fontSize.xs, color: theme.colors.textSecondary, marginTop: 2 },
  deleteButton: { paddingHorizontal: 4, paddingVertical: 2 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(15, 23, 42, 0.5)', justifyContent: 'flex-end' },
  modalContainer: { backgroundColor: '#fff', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, height: '80%', shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 10, elevation: 10 },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, paddingBottom: 16, borderBottomWidth: 1, borderBottomColor: '#F1F5F9' },
  modalTitle: { fontSize: 20, fontWeight: '700', color: '#1E293B' },
  formScroll: { flex: 1 },
  formScrollContent: { paddingBottom: 20 },
  modalLabel: { fontSize: 14, fontWeight: '600', color: '#475569', marginBottom: 8, marginTop: 12 },
  input: { backgroundColor: '#F8FAFC', borderRadius: 12, paddingHorizontal: 16, paddingVertical: 14, fontSize: 16, color: '#1E293B', borderWidth: 1, borderColor: '#E2E8F0' },
  notesInput: { minHeight: 80, textAlignVertical: 'top' },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', marginTop: 4 },
  chip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999, borderWidth: 1, borderColor: '#E2E8F0', marginRight: 8, marginBottom: 8, backgroundColor: '#fff' },
  chipSelected: { backgroundColor: '#E0ECFF', borderColor: theme.colors.primary },
  chipText: { fontSize: 13, color: '#64748B' },
  chipTextSelected: { color: theme.colors.primary, fontWeight: '600' },
  row: { flexDirection: 'row', justifyContent: 'space-between' },
  rowItem: { flex: 1 },
  inputLikeButton: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#F8FAFC', borderRadius: 12, paddingHorizontal: 16, paddingVertical: 14, borderWidth: 1, borderColor: '#E2E8F0', marginTop: 4 },
  inputLikeButtonText: { fontSize: 16, color: '#1E293B' },
  modalButtonsRow: { flexDirection: 'row', marginTop: 16, paddingTop: 16, borderTopWidth: 1, borderTopColor: '#F1F5F9' },
  modalButton: { flex: 1, paddingVertical: 14, borderRadius: 12, alignItems: 'center' },
  modalButtonSecondary: { borderWidth: 1, borderColor: '#E2E8F0', marginRight: 12, backgroundColor: '#fff' },
  modalButtonPrimary: { backgroundColor: theme.colors.primary },
  modalButtonSecondaryText: { fontSize: 16, color: '#1E293B', fontWeight: '600' },
  modalButtonPrimaryText: { fontSize: 16, color: '#fff', fontWeight: '700' }
});