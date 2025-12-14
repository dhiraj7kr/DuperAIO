import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';
import * as Network from 'expo-network';
import { useFocusEffect, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Animated,
  Image,
  Keyboard,
  Modal,
  RefreshControl,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  TouchableWithoutFeedback,
  View,
} from 'react-native';

import { useAppData } from '../src/context/AppDataContext';

// ==========================================
// 1. CONFIG & SHARED KEYS
// ==========================================
const PLANNER_KEY = 'plannerTasks_v3';
const FOCUS_KEY = 'focus_of_day_v1';

const THEME = {
  bg: '#F3F4F6',           // Slightly darker white for contrast
  textMain: '#111827',     // Near Black
  textSub: '#6B7280',      // Gray
  accentBlue: '#2563EB',   // Primary Blue
  
  // Modern Dashboard Colors
  weatherGradient: '#3B82F6', // Solid Blue for Weather Card
  cardWhite: '#FFFFFF',
  
  // Status Colors
  success: '#10B981',
  warning: '#F59E0B',
  danger: '#EF4444',
  
  // Github Streak Colors
  streak0: '#EBEDF0',
  streak1: '#9BE9A8',
  streak2: '#40C463',
  streak3: '#30A14E',
  streak4: '#216E39',
};

// ==========================================
// 2. HELPER FUNCTIONS
// ==========================================

const getLocalDateString = (dateObj = new Date()) => {
  const year = dateObj.getFullYear();
  const month = String(dateObj.getMonth() + 1).padStart(2, '0');
  const day = String(dateObj.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const toDate = (isoDate: string) => new Date(isoDate + 'T00:00:00');
const isSameDay = (a: Date, b: Date) =>
  a.getFullYear() === b.getFullYear() &&
  a.getMonth() === b.getMonth() &&
  a.getDate() === b.getDate();

const occursOnDate = (task: any, targetDateStr: string): boolean => {
  const base = toDate(task.date);
  const current = toDate(targetDateStr);
  
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

const getWeatherMeta = (wmoCode: number) => {
  if (wmoCode === 0) return { label: 'Clear Sky', icon: 'sunny' };
  if ([1, 2, 3].includes(wmoCode)) return { label: 'Cloudy', icon: 'cloud' };
  if ([51, 53, 55, 61, 63, 65, 66, 67].includes(wmoCode)) return { label: 'Rain', icon: 'rainy' };
  if ([71, 73, 75, 77].includes(wmoCode)) return { label: 'Snow', icon: 'snow' };
  return { label: 'Clear', icon: 'sunny' };
};

const getAqiMeta = (aqi: number) => {
  if (aqi <= 50) return { label: 'Good', color: '#10B981', percentage: '100%' };
  if (aqi <= 100) return { label: 'Moderate', color: '#F59E0B', percentage: '60%' };
  if (aqi <= 150) return { label: 'Unhealthy', color: '#EF4444', percentage: '30%' };
  return { label: 'Hazardous', color: '#7F1D1D', percentage: '10%' };
};

// ==========================================
// 3. COMPONENTS
// ==========================================
const BouncyCard = ({ children, onPress, style }: any) => {
  const scaleAnim = useRef(new Animated.Value(1)).current;
  const onPressIn = () => Animated.spring(scaleAnim, { toValue: 0.97, useNativeDriver: true, speed: 20 }).start();
  const onPressOut = () => Animated.spring(scaleAnim, { toValue: 1, useNativeDriver: true, speed: 20 }).start();

  return (
    <TouchableWithoutFeedback onPressIn={onPressIn} onPressOut={onPressOut} onPress={onPress}>
      <Animated.View style={[style, { transform: [{ scale: scaleAnim }] }]}>
        {children}
      </Animated.View>
    </TouchableWithoutFeedback>
  );
};

// ==========================================
// 4. MAIN SCREEN
// ==========================================
const HomeScreen: React.FC = () => {
  const { data, updateProfile } = useAppData();
  const { profile } = data;
  const router = useRouter();

  // --- STATE ---
  const [now, setNow] = useState(new Date());
  const [refreshing, setRefreshing] = useState(false);
  const [editVisible, setEditVisible] = useState(false);
  
  // Real-time Data
  const [todayTasks, setTodayTasks] = useState<any[]>([]);
  const [focusText, setFocusText] = useState('');
  
  // Streak Data
  const [streakHistory, setStreakHistory] = useState<any[]>([]);
  const [currentStreak, setCurrentStreak] = useState(0);

  // Environment Data
  const [weather, setWeather] = useState({ code: 0, temp: '--', city: 'Locating...', aqi: 0 });
  const [netInfo, setNetInfo] = useState<any>(null);
  const [ping, setPing] = useState<number | null>(null);

  // Form State
  const [name, setName] = useState(profile.name);
  const [role, setRole] = useState(profile.role);

  // Time Strings
  const dayName = now.toLocaleDateString('en-US', { weekday: 'short' });
  const dayNumber = now.getDate();
  const monthName = now.toLocaleDateString('en-US', { month: 'short' });

  // --- 0. PICK IMAGE FUNCTION ---
  const pickImage = async () => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.5,
      });

      if (!result.canceled) {
        updateProfile({ ...profile, avatarUri: result.assets[0].uri });
      }
    } catch (error) {
      console.log('Error picking image:', error);
    }
  };

  // --- 1. FETCH ENVIRONMENT ---
  const fetchEnvironment = async () => {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status === 'granted') {
        const loc = await Location.getCurrentPositionAsync({});
        const [wRes, aRes] = await Promise.all([
             fetch(`https://api.open-meteo.com/v1/forecast?latitude=${loc.coords.latitude}&longitude=${loc.coords.longitude}&current_weather=true`),
             fetch(`https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${loc.coords.latitude}&longitude=${loc.coords.longitude}&current=us_aqi`)
        ]);
        const wData = await wRes.json();
        const aData = await aRes.json();
        
        if (wData.current_weather) {
          setWeather({
            code: wData.current_weather.weathercode,
            temp: `${Math.round(wData.current_weather.temperature)}°`,
            city: profile.location || 'Hyderabad',
            aqi: aData.current ? aData.current.us_aqi : 0,
          });
        }
      }

      const netState = await Network.getNetworkStateAsync();
      setNetInfo(netState);
      if (netState.isConnected) {
        const start = Date.now();
        try {
            await fetch('https://www.google.com/generate_204', { cache: 'no-cache' });
            setPing(Date.now() - start);
        } catch(e) { setPing(null); }
      }
    } catch (e) { console.log(e); }
  };

  // --- 2. CALCULATE TASKS & STREAKS ---
  const loadRealTimeTasks = async () => {
    try {
      const tasksJson = await AsyncStorage.getItem(PLANNER_KEY);
      if (tasksJson) {
        const allTasks = JSON.parse(tasksJson);
        const now = new Date();
        const todayStr = getLocalDateString(now);
        const currentMinutes = now.getHours() * 60 + now.getMinutes();

        const filtered = allTasks.filter((t: any) => {
           const occurs = occursOnDate(t, todayStr);
           const isException = t.completedExceptions && t.completedExceptions.includes(todayStr);
           const isOneTimeDone = t.repeat === 'none' && t.isCompleted;

           let isFuture = true;
           if (t.startTime) {
               const [h, m] = t.startTime.split(':').map(Number);
               const taskMinutes = h * 60 + m;
               if (taskMinutes < currentMinutes) isFuture = false; 
           }

           return occurs && !isOneTimeDone && !isException && isFuture;
        });
        filtered.sort((a: any, b: any) => (a.startTime || '23:59').localeCompare(b.startTime || '23:59'));
        setTodayTasks(filtered);

        // Streak Calculation
        const history = [];
        for (let i = 13; i >= 0; i--) {
            const d = new Date();
            d.setDate(d.getDate() - i);
            const dStr = getLocalDateString(d); 
            
            let count = 0;
            allTasks.forEach((t: any) => {
                const occurs = occursOnDate(t, dStr);
                const isRecurringDone = t.completedExceptions && t.completedExceptions.includes(dStr);
                const isOneTimeDone = t.repeat === 'none' && t.isCompleted && t.date === dStr;
                if (occurs && (isRecurringDone || isOneTimeDone)) count++;
            });

            let intensity = 0;
            if (count > 0) intensity = 1;
            if (count > 2) intensity = 2;
            if (count > 4) intensity = 3;
            if (count > 6) intensity = 4;
            history.push({ date: dStr, count, intensity });
        }

        let tempStreak = 0;
        for (let i = history.length - 1; i >= 0; i--) {
            if (history[i].count > 0) tempStreak++;
            else if (i !== history.length - 1) break;
        }
        
        setCurrentStreak(tempStreak);
        setStreakHistory(history);
      }
    } catch (e) {}
  };

  // --- 3. FOCUS OF THE DAY ---
  const loadFocus = async () => {
      try {
          const saved = await AsyncStorage.getItem(FOCUS_KEY);
          if (saved) setFocusText(saved);
      } catch(e) {}
  };

  const saveFocus = async (text: string) => {
      setFocusText(text);
      try {
          await AsyncStorage.setItem(FOCUS_KEY, text);
      } catch(e) {}
  };

  useEffect(() => {
    fetchEnvironment();
    loadFocus();
    const interval = setInterval(() => {
        const current = new Date();
        setNow(current);
        if (current.getSeconds() === 0) loadRealTimeTasks();
        if (current.getSeconds() % 15 === 0) fetchEnvironment();
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  useFocusEffect(useCallback(() => { loadRealTimeTasks(); }, []));

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([fetchEnvironment(), loadRealTimeTasks(), loadFocus()]);
    setRefreshing(false);
  }, []);

  const weatherMeta = getWeatherMeta(weather.code);
  const aqiMeta = getAqiMeta(weather.aqi);
  const nextTask = todayTasks.length > 0 ? todayTasks[0] : null;

  const renderStreakBox = (item: any, index: number) => {
      let color = THEME.streak0;
      if (item.intensity === 1) color = THEME.streak1;
      if (item.intensity === 2) color = THEME.streak2;
      if (item.intensity === 3) color = THEME.streak3;
      if (item.intensity === 4) color = THEME.streak4;
      return <View key={index} style={[styles.streakBox, { backgroundColor: color }]} />;
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#F3F4F6" />

      <ScrollView 
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        
        {/* HEADER */}
        <View style={styles.headerRow}>
           <View style={{flexDirection:'row', alignItems:'center', gap: 10}}>
               <Image 
                 source={require('../assets/images/android-icon-foreground.png')}
                 style={styles.logoImage}
                 resizeMode="contain"
               />
               <Text style={styles.appNameText}>Duper</Text>
           </View>
           
           <TouchableOpacity onPress={() => setEditVisible(true)}>
             <View>
                {profile.avatarUri ? 
                    <Image source={{ uri: profile.avatarUri }} style={styles.avatar} /> : 
                    <View style={styles.avatarPlaceholder}><Text style={styles.avatarInitials}>{profile.name?.[0]}</Text></View>
                }
                <View style={styles.editBadge}>
                    <Ionicons name="pencil" size={10} color="#FFF" />
                </View>
             </View>
           </TouchableOpacity>
        </View>

        {/* --- STREAK SECTION --- */}
        <BouncyCard style={styles.streakCard}>
             <View style={styles.streakHeader}>
                 <View style={{flexDirection:'row', alignItems:'center', gap: 6}}>
                     <Ionicons name="flame" size={18} color="#EA580C" />
                     <Text style={styles.streakTitle}>Daily Activity</Text>
                 </View>
                 <Text style={styles.streakCount}>{currentStreak} Day Streak {currentStreak > 2 ? '🔥' : ''}</Text>
             </View>
             <View style={styles.streakGrid}>
                 {streakHistory.map((item, index) => renderStreakBox(item, index))}
             </View>
             <View style={styles.streakFooter}>
                 <Text style={styles.streakFooterText}>Last 14 Days</Text>
                 <View style={styles.streakLegend}>
                    <View style={[styles.legendBox, {backgroundColor: THEME.streak0}]} />
                    <View style={[styles.legendBox, {backgroundColor: THEME.streak2}]} />
                    <View style={[styles.legendBox, {backgroundColor: THEME.streak4}]} />
                 </View>
             </View>
        </BouncyCard>

        {/* --- FOCUS OF THE DAY --- */}
        <BouncyCard style={styles.focusCard}>
            <View style={{flexDirection:'row', alignItems:'center', gap: 8, marginBottom: 8}}>
                <Ionicons name="radio-button-on" size={16} color={THEME.accentBlue} />
                <Text style={styles.focusLabel}>Focus of the Day</Text>
            </View>
            <TextInput 
                style={styles.focusInput}
                placeholder="What is your main goal today?"
                value={focusText}
                onChangeText={saveFocus}
                placeholderTextColor="#9CA3AF"
                multiline
                maxLength={60}
                blurOnSubmit
                onSubmitEditing={Keyboard.dismiss}
            />
        </BouncyCard>

        {/* --- OVERVIEW (SINGLE SUPER CARD - THINNER) --- */}
        <BouncyCard style={styles.superCard}>
            {/* Top: Weather */}
            <View style={styles.superWeatherRow}>
                <View>
                    <Text style={styles.superTemp}>{weather.temp}</Text>
                    <View style={{flexDirection:'row', alignItems:'center', gap: 6}}>
                        <Text style={styles.superCondition}>{weatherMeta.label}</Text>
                        <View style={styles.dotSeparator} />
                        <Text style={styles.superLocation}>{weather.city}</Text>
                    </View>
                </View>
                <Ionicons name={weatherMeta.icon as any} size={42} color={THEME.weatherGradient} />
            </View>

            <View style={styles.divider} />

            {/* Bottom: 3 Stats Cols */}
            <View style={styles.superStatsRow}>
                {/* Calendar */}
                <View style={styles.superStatItem}>
                    <Ionicons name="calendar-outline" size={18} color="#EF4444" style={{marginBottom:4}} />
                    <Text style={styles.superStatValue}>{dayNumber} {monthName}</Text>
                    <Text style={styles.superStatLabel}>{dayName}</Text>
                </View>

                {/* AQI */}
                <View style={styles.superStatItem}>
                    <Ionicons name="leaf-outline" size={18} color={aqiMeta.color} style={{marginBottom:4}} />
                    <Text style={[styles.superStatValue, {color:aqiMeta.color}]}>{weather.aqi}</Text>
                    <Text style={styles.superStatLabel}>AQI: {aqiMeta.label}</Text>
                </View>

                {/* Network */}
                <View style={styles.superStatItem}>
                    <Ionicons name="wifi-outline" size={18} color="#7C3AED" style={{marginBottom:4}} />
                    <Text style={[styles.superStatValue, {color:'#7C3AED'}]}>{ping ? ping : '--'} ms</Text>
                    <Text style={styles.superStatLabel}>{netInfo?.isConnected ? 'Online' : 'Offline'}</Text>
                </View>
            </View>
        </BouncyCard>

        {/* --- UP NEXT --- */}
        <View style={styles.sectionHeaderRow}>
            <Text style={styles.sectionTitleNoMargin}>Up Next</Text>
            <TouchableOpacity onPress={() => router.push('/planner')}>
                <Text style={styles.linkText}>View Planner</Text>
            </TouchableOpacity>
        </View>
        
        {nextTask ? (
            <BouncyCard onPress={() => router.push('/planner')} style={styles.taskCard}>
                    <View style={styles.taskLeftBar} />
                    <View style={styles.taskContent}>
                        <View style={{flexDirection:'row', justifyContent:'space-between'}}>
                           <Text style={styles.taskTitle}>{nextTask.title}</Text>
                           <Text style={styles.taskTime}>{nextTask.startTime || 'All Day'}</Text>
                        </View>
                        <Text style={styles.taskSub} numberOfLines={1}>
                            {nextTask.notes || 'No additional details'}
                        </Text>
                        {todayTasks.length > 1 && (
                            <Text style={{fontSize: 11, color: THEME.accentBlue, marginTop: 4}}>
                                + {todayTasks.length - 1} more tasks today
                            </Text>
                        )}
                    </View>
                    <Ionicons name="chevron-forward" size={20} color="#D1D5DB" />
            </BouncyCard>
        ) : (
            <View style={styles.emptyBox}>
                <Ionicons name="calendar" size={24} color="#D1D5DB" />
                <Text style={styles.emptyText}>No upcoming tasks for today.</Text>
            </View>
        )}

        <View style={{ height: 100 }} />
      </ScrollView>

      {/* PROFESSIONAL PROFILE EDIT MODAL */}
      <Modal visible={editVisible} transparent animationType="fade">
        <View style={styles.modalBackdrop}>
            <View style={styles.modalContent}>
                <View style={styles.modalHeader}>
                    <Text style={styles.modalTitle}>Edit Profile</Text>
                    <TouchableOpacity onPress={() => setEditVisible(false)}>
                        <Ionicons name="close" size={24} color="#9CA3AF" />
                    </TouchableOpacity>
                </View>
                
                <View style={{alignItems:'center', marginBottom: 24}}>
                    <View style={styles.modalAvatarContainer}>
                        {profile.avatarUri ? 
                           <Image source={{ uri: profile.avatarUri }} style={styles.modalAvatar} /> : 
                           <View style={styles.modalAvatarPlaceholder}>
                               <Text style={{fontSize:36, color:'#9CA3AF'}}>{profile.name?.[0]}</Text>
                           </View>
                        }
                    </View>
                    
                    <TouchableOpacity onPress={pickImage} style={styles.changePhotoBtn}>
                        <Ionicons name="camera-outline" size={18} color="#4B5563" />
                        <Text style={styles.changePhotoText}>Change Photo</Text>
                    </TouchableOpacity>
                </View>

                <View style={{width:'100%', gap: 12}}>
                    <View>
                        <Text style={styles.inputLabel}>Display Name</Text>
                        <TextInput style={styles.input} value={name} onChangeText={setName} placeholder="Enter your name" />
                    </View>
                    <View>
                        <Text style={styles.inputLabel}>Role / Title</Text>
                        <TextInput style={styles.input} value={role} onChangeText={setRole} placeholder="e.g. Developer" />
                    </View>
                </View>
                
                <View style={styles.modalBtns}>
                    <TouchableOpacity onPress={() => setEditVisible(false)} style={styles.btnCancel}><Text style={styles.btnText}>Cancel</Text></TouchableOpacity>
                    <TouchableOpacity onPress={() => { updateProfile({...profile, name, role}); setEditVisible(false) }} style={styles.btnSave}><Text style={[styles.btnText, {color:'#fff'}]}>Save Changes</Text></TouchableOpacity>
                </View>
            </View>
        </View>
      </Modal>

    </View>
  );
};

export default HomeScreen;

// ==========================================
// 5. STYLES (MODERNIZED & THINNER CARDS)
// ==========================================
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F3F4F6' },
  scrollContent: { padding: 20, paddingTop: 60 },

  // Header
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  appNameText: { fontSize: 28, fontWeight: '900', color: '#002C8A', letterSpacing: -0.5 },
  logoImage: { width: 42, height: 42 },
  
  // Profile Picture
  avatar: { width: 48, height: 48, borderRadius: 24, borderWidth: 2, borderColor: '#fff' },
  avatarPlaceholder: { width: 48, height: 48, borderRadius: 24, backgroundColor: '#E5E7EB', justifyContent:'center', alignItems:'center', borderWidth: 2, borderColor: '#fff' },
  avatarInitials: { fontSize: 20, fontWeight:'600', color: '#6B7280' },
  editBadge: { position: 'absolute', bottom: 0, right: 0, backgroundColor: THEME.accentBlue, width: 16, height: 16, borderRadius: 8, alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderColor: '#fff' },

  // Streak Card
  streakCard: {
    backgroundColor: '#fff', borderRadius: 24, padding: 20, marginBottom: 16,
    shadowColor: "#000", shadowOffset: {width:0, height:4}, shadowOpacity:0.05, shadowRadius:10, elevation:2
  },
  streakHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  streakTitle: { fontSize: 15, fontWeight: '700', color: '#374151' },
  streakCount: { fontSize: 13, fontWeight: '700', color: '#EA580C', backgroundColor: '#FFF7ED', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12, overflow:'hidden' },
  streakGrid: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 12 },
  streakBox: { width: 18, height: 18, borderRadius: 5 }, 
  streakFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  streakFooterText: { fontSize: 11, color: '#9CA3AF', fontWeight: '500' },
  streakLegend: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  legendBox: { width: 10, height: 10, borderRadius: 3 },

  // --- FOCUS OF THE DAY ---
  focusCard: {
      backgroundColor: '#fff', borderRadius: 20, padding: 16, marginBottom: 24,
      shadowColor: "#000", shadowOffset: {width:0, height:2}, shadowOpacity:0.03, shadowRadius:4, elevation: 1
  },
  focusLabel: { fontSize: 12, fontWeight: '700', color: '#374151', textTransform: 'uppercase', letterSpacing: 0.5 },
  focusInput: { fontSize: 16, color: '#1F2937', fontWeight: '500', paddingVertical: 4 },

  // --- SINGLE OVERVIEW CARD ("Super Card") - THINNER ---
  superCard: {
      backgroundColor: '#FFF', borderRadius: 24, padding: 16, // Reduced padding from 18 -> 16
      shadowColor: "#000", shadowOffset: {width:0, height:4}, shadowOpacity:0.05, shadowRadius:10, elevation: 3
  },
  superWeatherRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  superTemp: { fontSize: 38, fontWeight: '800', color: '#1F2937', letterSpacing: -1 },
  superCondition: { fontSize: 14, fontWeight: '600', color: '#6B7280' },
  superLocation: { fontSize: 14, fontWeight: '600', color: '#9CA3AF' },
  dotSeparator: { width: 4, height: 4, borderRadius: 2, backgroundColor: '#D1D5DB', marginHorizontal: 2 },
  
  divider: { height: 1, backgroundColor: '#F3F4F6', marginVertical: 12 }, // Reduced vertical margin
  
  superStatsRow: { flexDirection: 'row', justifyContent: 'space-between' },
  superStatItem: { alignItems: 'flex-start', flex: 1 },
  superStatValue: { fontSize: 14, fontWeight: '700', color: '#1F2937', marginBottom: 2 },
  superStatLabel: { fontSize: 11, color: '#9CA3AF', fontWeight: '500' },

  // --- UP NEXT (Shared Styles) ---
  sectionTitleNoMargin: { fontSize: 20, fontWeight: '800', color: '#111827' },
  sectionHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 32, marginBottom: 16 },
  linkText: { color: THEME.accentBlue, fontWeight: '700', fontSize: 14 },
  taskCard: {
    backgroundColor: '#fff', borderRadius: 20, padding: 16, flexDirection: 'row', alignItems: 'center', marginBottom: 10,
    shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.03, shadowRadius: 4, elevation: 1
  },
  taskLeftBar: { width: 4, height: 40, backgroundColor: THEME.accentBlue, borderRadius: 2, marginRight: 16 },
  taskContent: { flex: 1 },
  taskTitle: { fontSize: 16, fontWeight: '700', color: '#1F2937' },
  taskTime: { fontSize: 14, fontWeight: '600', color: THEME.accentBlue, marginBottom: 2 },
  taskSub: { fontSize: 13, color: '#9CA3AF' },
  emptyBox: { padding: 30, alignItems: 'center', justifyContent: 'center', backgroundColor: '#fff', borderRadius: 20, gap: 12, borderStyle: 'dashed', borderWidth: 2, borderColor: '#E5E7EB' },
  emptyText: { color: '#9CA3AF', fontWeight: '500' },

  // PROFESSIONAL MODAL STYLES
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: 20 },
  modalContent: { backgroundColor: '#fff', borderRadius: 24, padding: 24, alignItems: 'center', width: '100%', maxWidth: 340, alignSelf:'center' },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', width: '100%', marginBottom: 20, alignItems: 'center' },
  modalTitle: { fontSize: 20, fontWeight: '800', color: '#111827' },
  
  // Modal Avatar
  modalAvatarContainer: { marginBottom: 12, shadowColor: "#000", shadowOffset: {width:0, height:4}, shadowOpacity:0.1, shadowRadius:10, elevation: 3 },
  modalAvatar: { width: 90, height: 90, borderRadius: 45, borderWidth: 3, borderColor: '#FFF' },
  modalAvatarPlaceholder: { width: 90, height: 90, borderRadius: 45, backgroundColor: '#F3F4F6', justifyContent:'center', alignItems:'center', borderWidth: 3, borderColor: '#FFF' },
  
  // Change Photo Button
  changePhotoBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#F3F4F6', paddingVertical: 8, paddingHorizontal: 16, borderRadius: 20 },
  changePhotoText: { fontSize: 13, fontWeight: '600', color: '#4B5563' },
  
  // Inputs
  inputLabel: { fontSize: 13, fontWeight: '700', color: '#374151', marginBottom: 6, marginLeft: 4 },
  input: { backgroundColor: '#F9FAFB', padding: 14, borderRadius: 12, width: '100%', fontSize: 15, borderWidth: 1, borderColor: '#E5E7EB', color: '#1F2937' },
  
  // Action Buttons
  modalBtns: { flexDirection: 'row', gap: 12, marginTop: 24, width: '100%' },
  btnCancel: { flex: 1, padding: 14, borderRadius: 12, backgroundColor: '#F3F4F6', alignItems: 'center' },
  btnSave: { flex: 1, padding: 14, borderRadius: 12, backgroundColor: THEME.accentBlue, alignItems: 'center', shadowColor: THEME.accentBlue, shadowOffset: {width:0, height:4}, shadowOpacity:0.2, shadowRadius:8, elevation: 3 },
  btnText: { fontWeight: '700', fontSize: 15, color: '#4B5563' },
});