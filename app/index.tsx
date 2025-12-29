import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';
import * as Network from 'expo-network';
import { useFocusEffect, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Animated,
  Dimensions,
  Easing,
  Image,
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
  ViewStyle
} from 'react-native';

import { useAppData } from '../src/context/AppDataContext';

// ==========================================
// 1. CONFIG & TYPES
// ==========================================
const PLANNER_KEY = 'plannerTasks_v3';
const FOCUS_KEY = 'focus_of_day_v1';
const WATER_KEY = 'water_tracker_v1';
const WATER_GOAL = 8;
const STREAK_DAYS_LxOOKBACK = 13; // 14 days total including today

const SCREEN_WIDTH = Dimensions.get('window').width;

const THEME = {
  bg: '#F8FAFC',
  textMain: '#111827',
  textSub: '#64748B',
  accentBlue: '#3B82F6',
  accentDark: '#1E293B',
  streak0: '#E2E8F0',
  streak1: '#86EFAC',
  streak2: '#4ADE80',
  streak3: '#22C55E',
  streak4: '#166534',
};

const QUOTES = [
  "Dream big. Start small. Act now.",
  "Focus on being productive instead of busy.",
  "The future depends on what you do today.",
  "Don't watch the clock; do what it does. Keep going.",
  "Small progress is still progress.",
];

// --- Interfaces ---
interface Task {
  title: string;
  date: string;
  startTime?: string;
  repeat: 'none' | 'daily' | 'weekly' | 'monthly' | 'yearly';
  isCompleted: boolean;
  completedExceptions?: string[];
  notes?: string;
}

interface WeatherData {
  code: number;
  temp: string;
  city: string;
  aqi: number;
}

interface StreakItem {
  date: string;
  count: number;
  intensity: number;
}

// ==========================================
// 2. HELPER FUNCTIONS
// ==========================================

const getLocalDateString = (dateObj = new Date()) => {
  // Returns YYYY-MM-DD using local time logic
  const offset = dateObj.getTimezoneOffset() * 60000;
  return new Date(dateObj.getTime() - offset).toISOString().split('T')[0];
};

const toDate = (isoDate: string) => new Date(isoDate + 'T00:00:00');

const isSameDay = (a: Date, b: Date) =>
  a.getFullYear() === b.getFullYear() &&
  a.getMonth() === b.getMonth() &&
  a.getDate() === b.getDate();

const occursOnDate = (task: Task, targetDateStr: string): boolean => {
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
  if (wmoCode === 0) return { label: 'Clear Sky', icon: 'sunny', type: 'sun' };
  if ([1, 2, 3].includes(wmoCode)) return { label: 'Cloudy', icon: 'cloud', type: 'cloud' };
  if ([51, 53, 55, 61, 63, 65, 66, 67, 80, 81, 82].includes(wmoCode)) return { label: 'Rain', icon: 'rainy', type: 'rain' };
  if ([71, 73, 75, 77, 85, 86].includes(wmoCode)) return { label: 'Snow', icon: 'snow', type: 'snow' };
  return { label: 'Clear', icon: 'sunny', type: 'sun' };
};

const getAqiMeta = (aqi: number) => {
  if (aqi <= 50) return { label: 'Good', color: '#4ADE80' };
  if (aqi <= 100) return { label: 'Moderate', color: '#FACC15' };
  if (aqi <= 150) return { label: 'Unhealthy', color: '#F87171' };
  return { label: 'Hazardous', color: '#EF4444' };
};

const getGreeting = (hour: number) => {
  if (hour < 12) return "Good Morning";
  if (hour < 18) return "Good Afternoon";
  return "Good Evening";
};

// ==========================================
// 3. CUSTOM HOOKS (Logic Extraction)
// ==========================================

const useWeather = (userLocation: string | undefined) => {
  const [weather, setWeather] = useState<WeatherData>({ code: 0, temp: '--', city: 'Locating...', aqi: 0 });
  const [netInfo, setNetInfo] = useState<any>(null);
  const [ping, setPing] = useState<number | null>(null);

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

        // Reverse Geocoding
        let locationDisplay = userLocation || 'Unknown Location';
        try {
            const geocodeResult = await Location.reverseGeocodeAsync({
                latitude: loc.coords.latitude,
                longitude: loc.coords.longitude
            });

            if (geocodeResult && geocodeResult.length > 0) {
                const address = geocodeResult[0];
                const city = address.city || address.subregion || address.region;
                const country = address.country;
                if (city && country) locationDisplay = `${city}, ${country}`;
                else if (city) locationDisplay = city;
                else if (country) locationDisplay = country;
            }
        } catch (geoError) {
            console.log("Geocoding failed:", geoError);
        }
        
        if (wData.current_weather) {
          setWeather({
            code: wData.current_weather.weathercode,
            temp: `${Math.round(wData.current_weather.temperature)}°`,
            city: locationDisplay,
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

  return { weather, netInfo, ping, fetchEnvironment };
};

const useTasks = () => {
  const [todayTasks, setTodayTasks] = useState<Task[]>([]);
  const [streakHistory, setStreakHistory] = useState<StreakItem[]>([]);
  const [currentStreak, setCurrentStreak] = useState(0);

  const loadTasks = async () => {
    try {
      const tasksJson = await AsyncStorage.getItem(PLANNER_KEY);
      if (tasksJson) {
        const allTasks: Task[] = JSON.parse(tasksJson);
        const todayStr = getLocalDateString(new Date());
        const currentMinutes = new Date().getHours() * 60 + new Date().getMinutes();

        // Filter for today
        const filtered = allTasks.filter((t) => {
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
        filtered.sort((a, b) => (a.startTime || '23:59').localeCompare(b.startTime || '23:59'));
        setTodayTasks(filtered);

        // Streak History Calculation
        const history: StreakItem[] = [];
        for (let i = STREAK_DAYS_LxOOKBACK; i >= 0; i--) {
            const d = new Date();
            d.setDate(d.getDate() - i);
            const dStr = getLocalDateString(d); 
            let count = 0;
            allTasks.forEach((t) => {
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
    } catch (e) { console.error("Error loading tasks", e); }
  };

  return { todayTasks, streakHistory, currentStreak, loadTasks };
};

const useWaterTracker = () => {
  const [waterCount, setWaterCount] = useState(0);

  const loadWater = async () => {
    try {
      const todayStr = getLocalDateString(new Date());
      const savedWater = await AsyncStorage.getItem(WATER_KEY);
      if (savedWater) {
          const parsedWater = JSON.parse(savedWater);
          if (parsedWater.date === todayStr) {
              setWaterCount(parsedWater.count);
          } else {
              setWaterCount(0);
          }
      }
    } catch (e) {}
  };

  const addWater = async () => {
      const newCount = waterCount >= WATER_GOAL ? 0 : waterCount + 1;
      setWaterCount(newCount);
      const data = { date: getLocalDateString(new Date()), count: newCount };
      try { await AsyncStorage.setItem(WATER_KEY, JSON.stringify(data)); } catch(e) {}
  };

  return { waterCount, addWater, loadWater };
};

// ==========================================
// 4. ANIMATION COMPONENTS
// ==========================================

const SunAnimation = () => {
  const rotateAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.loop(
      Animated.timing(rotateAnim, {
        toValue: 1,
        duration: 8000,
        easing: Easing.linear,
        useNativeDriver: true,
      })
    ).start();
  }, []);

  const spin = rotateAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  });

  return (
    <Animated.View style={[styles.weatherAnimContainer, { transform: [{ rotate: spin }] }]}>
      <Ionicons name="sunny" size={140} color="#FDB813" style={{ opacity: 0.2 }} />
    </Animated.View>
  );
};

interface FallingParticleProps {
  delay: number;
  duration: number;
  startX: number;
  children: React.ReactNode;
}

const FallingParticle: React.FC<FallingParticleProps> = ({ delay, duration, startX, children }) => {
  const anim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(anim, {
          toValue: 1,
          duration: duration,
          delay: delay,
          easing: Easing.linear,
          useNativeDriver: true,
        }),
        Animated.timing(anim, { toValue: 0, duration: 0, useNativeDriver: true }),
      ])
    ).start();
  }, []);

  const translateY = anim.interpolate({
    inputRange: [0, 1],
    outputRange: [-20, 180],
  });

  return (
    <Animated.View style={{ position: 'absolute', left: startX, top: 0, transform: [{ translateY }] }}>
      {children}
    </Animated.View>
  );
};

const RainAnimation = () => {
  const drops = useRef(Array.from({ length: 15 }).map((_, i) => ({
    id: i,
    startX: Math.random() * (SCREEN_WIDTH - 80),
    delay: Math.random() * 1000,
    duration: 800 + Math.random() * 500,
  }))).current;

  return (
    <View style={[styles.weatherAnimContainer, styles.overflowHidden]}>
      {drops.map((drop) => (
        <FallingParticle key={drop.id} {...drop}>
          <View style={styles.rainDrop} />
        </FallingParticle>
      ))}
    </View>
  );
};

const SnowAnimation = () => {
  const flakes = useRef(Array.from({ length: 12 }).map((_, i) => ({
    id: i,
    startX: Math.random() * (SCREEN_WIDTH - 80),
    delay: Math.random() * 2000,
    duration: 2500 + Math.random() * 1000,
  }))).current;

  return (
    <View style={[styles.weatherAnimContainer, styles.overflowHidden]}>
      {flakes.map((flake) => (
        <FallingParticle key={flake.id} {...flake}>
          <View style={styles.snowFlake} />
        </FallingParticle>
      ))}
    </View>
  );
};

const WeatherEffect = ({ type }: { type: string }) => {
  if (type === 'sun') return <SunAnimation />;
  if (type === 'rain') return <RainAnimation />;
  if (type === 'snow') return <SnowAnimation />;
  return null;
};

// ==========================================
// 5. MAIN COMPONENT
// ==========================================

const BouncyCard = ({ children, onPress, style }: { children: React.ReactNode, onPress?: () => void, style?: ViewStyle | ViewStyle[] }) => {
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

const HomeScreen: React.FC = () => {
  const { data, updateProfile } = useAppData();
  const { profile } = data;
  const router = useRouter();

  // Custom Hooks for Logic Separation
  const { weather, netInfo, ping, fetchEnvironment } = useWeather(profile.location);
  const { todayTasks, streakHistory, currentStreak, loadTasks } = useTasks();
  const { waterCount, addWater, loadWater } = useWaterTracker();

  // Local State
  const [now, setNow] = useState(new Date());
  const [refreshing, setRefreshing] = useState(false);
  const [editVisible, setEditVisible] = useState(false);
  const [focusText, setFocusText] = useState('');
  const [quote, setQuote] = useState(QUOTES[0]);
  const [name, setName] = useState(profile.name);
  const [role, setRole] = useState(profile.role);

  // Derived Strings
  const dateStr = now.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  const timeStr = now.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
  const greeting = getGreeting(now.getHours());
  const weatherMeta = getWeatherMeta(weather.code);
  const aqiMeta = getAqiMeta(weather.aqi);
  const nextTask = todayTasks.length > 0 ? todayTasks[0] : null;

  // Actions
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

  const saveFocus = async (text: string) => {
      setFocusText(text);
      try { await AsyncStorage.setItem(FOCUS_KEY, text); } catch(e) {}
  };

  // Initialization & Timers
  useEffect(() => {
    const init = async () => {
       await Promise.all([fetchEnvironment(), loadTasks(), loadWater()]);
       const savedFocus = await AsyncStorage.getItem(FOCUS_KEY);
       if (savedFocus) setFocusText(savedFocus);
       const randomIndex = Math.floor(Math.random() * QUOTES.length);
       setQuote(QUOTES[randomIndex]);
    };
    init();

    const interval = setInterval(() => {
        const current = new Date();
        setNow(current); 
        // Sync checks on minute start
        if (current.getSeconds() === 0) {
            loadTasks();
            if (current.getMinutes() % 5 === 0) {
                fetchEnvironment();
            }
        }
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  useFocusEffect(useCallback(() => { loadTasks(); loadWater(); }, []));

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([fetchEnvironment(), loadTasks(), loadWater()]);
    setRefreshing(false);
  }, []);

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#F8FAFC" />

      <ScrollView 
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        
        {/* --- 1. HEADER --- */}
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
             <View style={styles.avatarContainer}>
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

        {/* --- 2. GREETING --- */}
        <View style={{marginBottom: 16}}>
            <Text style={styles.greetingText}>{greeting}, {profile.name || 'User'}</Text>
        </View>

        {/* --- 3. COMMAND CENTER --- */}
        <BouncyCard style={styles.commandCard}>
            <WeatherEffect type={weatherMeta.type} />

            <View style={styles.commandTopRow}>
                <View>
                    <Text style={styles.commandTemp}>{weather.temp}</Text>
                    <Text style={styles.commandCondition}>{weatherMeta.label} • {weather.city}</Text>
                </View>
                <Ionicons name={weatherMeta.icon as any} size={48} color="#FFF" />
            </View>

            <View style={styles.commandDivider} />

            <View style={styles.commandStatsRow}>
                <View style={styles.commandStat}>
                     <Ionicons name="calendar-outline" size={16} color="rgba(255,255,255,0.7)" />
                     <Text style={styles.commandStatText}>{dateStr} • {timeStr}</Text>
                </View>
                <View style={styles.commandStat}>
                     <Ionicons name="leaf-outline" size={16} color={aqiMeta.color} />
                     <Text style={[styles.commandStatText, {color: aqiMeta.color}]}>AQI {weather.aqi}</Text>
                </View>
                <View style={styles.commandStat}>
                     <Ionicons name="wifi-outline" size={16} color="rgba(255,255,255,0.7)" />
                     <Text style={styles.commandStatText}>{ping ? `${ping}ms` : 'Offline'}</Text>
                </View>
            </View>
        </BouncyCard>

        {/* --- 4. BENTO GRID --- */}
        <View style={styles.bentoRow}>
            <BouncyCard style={[styles.bentoItem, styles.focusCard]}>
                <View style={styles.bentoHeader}>
                    <View style={[styles.iconCircle, {backgroundColor: '#DBEAFE'}]}>
                        <Ionicons name="locate" size={16} color={THEME.accentBlue} />
                    </View>
                    <Text style={styles.bentoTitle}>Focus</Text>
                </View>
                <TextInput 
                    style={styles.focusInput}
                    placeholder="Set main goal..."
                    value={focusText}
                    onChangeText={saveFocus}
                    placeholderTextColor="#94A3B8"
                    multiline
                    maxLength={50}
                    blurOnSubmit
                />
            </BouncyCard>

            <BouncyCard onPress={addWater} style={[styles.bentoItem, styles.waterCard]}>
                <View style={styles.bentoHeader}>
                    <View style={[styles.iconCircle, {backgroundColor: '#E0F2FE'}]}>
                        <Ionicons name="water" size={16} color="#0EA5E9" />
                    </View>
                    <Text style={styles.bentoTitle}>Hydration</Text>
                </View>
                <View style={styles.waterContent}>
                    <Text style={styles.waterCount}>{waterCount}<Text style={styles.waterTotal}>/{WATER_GOAL}</Text></Text>
                    <Text style={styles.waterUnit}>glasses</Text>
                </View>
                <View style={styles.waterBarBg}>
                    <View style={[styles.waterBarFill, { width: `${(waterCount/WATER_GOAL)*100}%` }]} />
                </View>
            </BouncyCard>
        </View>

        {/* --- 5. STREAK --- */}
        <BouncyCard style={styles.streakCard}>
             <View style={styles.streakHeader}>
                 <View style={{flexDirection:'row', alignItems:'center', gap: 6}}>
                     <Ionicons name="flame" size={18} color="#EA580C" />
                     <Text style={styles.streakTitle}>Consistency</Text>
                 </View>
                 <Text style={styles.streakCount}>{currentStreak} Day Streak 🔥</Text>
             </View>
             <View style={styles.streakGrid}>
                 {streakHistory.map((item, index) => {
                     let color = THEME.streak0;
                     if (item.intensity === 1) color = THEME.streak1;
                     if (item.intensity === 2) color = THEME.streak2;
                     if (item.intensity === 3) color = THEME.streak3;
                     if (item.intensity === 4) color = THEME.streak4;
                     return <View key={index} style={[styles.streakBox, { backgroundColor: color }]} />;
                 })}
             </View>
        </BouncyCard>

        {/* --- 6. QUOTE --- */}
        <View style={styles.quoteContainer}>
            <Text style={styles.quoteText}>"{quote}"</Text>
        </View>

        {/* --- 7. TASKS --- */}
        <View style={styles.sectionHeaderRow}>
            <Text style={styles.sectionTitleNoMargin}>Up Next</Text>
            <TouchableOpacity onPress={() => router.push('/planner')}>
                <Text style={styles.linkText}>See All</Text>
            </TouchableOpacity>
        </View>
        
        {nextTask ? (
            <BouncyCard onPress={() => router.push('/planner')} style={styles.taskCard}>
                    <View style={styles.taskLeftBar} />
                    <View style={styles.taskContent}>
                        <View style={{flexDirection:'row', justifyContent:'space-between', alignItems:'center'}}>
                           <Text style={styles.taskTitle}>{nextTask.title}</Text>
                           <View style={styles.timeTag}>
                               <Ionicons name="time-outline" size={12} color={THEME.accentBlue} />
                               <Text style={styles.taskTime}>{nextTask.startTime || 'Now'}</Text>
                           </View>
                        </View>
                        <Text style={styles.taskSub} numberOfLines={1}>
                            {nextTask.notes || 'No additional details provided'}
                        </Text>
                        {todayTasks.length > 1 && (
                            <Text style={{fontSize: 11, color: THEME.textSub, marginTop: 6, fontWeight:'500'}}>
                                + {todayTasks.length - 1} more tasks waiting
                            </Text>
                        )}
                    </View>
                    <Ionicons name="chevron-forward" size={20} color="#D1D5DB" />
            </BouncyCard>
        ) : (
            <View style={styles.emptyBox}>
                <Ionicons name="checkmark-circle-outline" size={40} color="#CBD5E1" />
                <Text style={styles.emptyText}>You're all caught up!</Text>
                <Text style={styles.emptySub}>Enjoy your free time.</Text>
            </View>
        )}

        <View style={{ height: 100 }} />
      </ScrollView>

      {/* --- EDIT MODAL --- */}
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
                    <TouchableOpacity onPress={pickImage}>
                        {profile.avatarUri ? 
                           <Image source={{ uri: profile.avatarUri }} style={styles.modalAvatar} /> : 
                           <View style={styles.modalAvatarPlaceholder}><Text style={{fontSize:36, color:'#9CA3AF'}}>{profile.name?.[0]}</Text></View>
                        }
                        <View style={styles.changePhotoBadge}><Ionicons name="camera" size={14} color="#FFF" /></View>
                    </TouchableOpacity>
                </View>

                <View style={{width:'100%', gap: 16}}>
                    <View>
                        <Text style={styles.inputLabel}>Display Name</Text>
                        <TextInput style={styles.input} value={name} onChangeText={setName} />
                    </View>
                    <View>
                        <Text style={styles.inputLabel}>Role / Title</Text>
                        <TextInput style={styles.input} value={role} onChangeText={setRole} />
                    </View>
                </View>
                
                <TouchableOpacity onPress={() => { updateProfile({...profile, name, role}); setEditVisible(false) }} style={styles.btnSave}>
                    <Text style={styles.btnTextWhite}>Save Changes</Text>
                </TouchableOpacity>
            </View>
        </View>
      </Modal>

    </View>
  );
};

export default HomeScreen;

// ==========================================
// 6. STYLES
// ==========================================
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: THEME.bg },
  scrollContent: { padding: 20, paddingTop: 50 },

  // --- Header ---
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  appNameText: { fontSize: 28, fontWeight: '900', color: '#002C8A', letterSpacing: -0.5 },
  logoImage: { width: 42, height: 42 },
  greetingText: { fontSize: 22, color: THEME.textMain, fontWeight: '700', letterSpacing: -0.5 },

  // Profile
  avatarContainer: { position: 'relative' },
  avatar: { width: 44, height: 44, borderRadius: 22, borderWidth: 2, borderColor: '#fff' },
  avatarPlaceholder: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#E2E8F0', justifyContent:'center', alignItems:'center', borderWidth: 2, borderColor: '#fff' },
  avatarInitials: { fontSize: 18, fontWeight:'700', color: '#64748B' },
  editBadge: { position: 'absolute', bottom: -2, right: -2, backgroundColor: THEME.textMain, width: 18, height: 18, borderRadius: 9, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: '#fff' },

  // --- Command Center ---
  commandCard: {
      backgroundColor: THEME.accentDark, borderRadius: 24, padding: 20, marginBottom: 20,
      shadowColor: "#1E293B", shadowOffset: {width:0, height:8}, shadowOpacity:0.25, shadowRadius:12, elevation: 6,
      overflow: 'hidden', 
      position: 'relative' 
  },
  weatherAnimContainer: {
      position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
      zIndex: 0, justifyContent: 'center', alignItems: 'center'
  },
  overflowHidden: { width: '100%', overflow: 'hidden' },
  commandTopRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', zIndex: 1 },
  commandTemp: { fontSize: 42, fontWeight: '800', color: '#FFF', letterSpacing: -1 },
  commandCondition: { fontSize: 14, fontWeight: '600', color: '#94A3B8', marginTop: 4 },
  commandDivider: { height: 1, backgroundColor: 'rgba(255,255,255,0.15)', marginVertical: 16 },
  commandStatsRow: { flexDirection: 'row', justifyContent: 'space-between', zIndex: 1 },
  commandStat: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  commandStatText: { fontSize: 13, color: '#FFF', fontWeight: '600' },
  rainDrop: { width: 2, height: 15, backgroundColor: '#60A5FA', opacity: 0.6, borderRadius: 1 },
  snowFlake: { width: 6, height: 6, backgroundColor: '#FFFFFF', opacity: 0.8, borderRadius: 3 },

  // --- Bento Grid ---
  bentoRow: { flexDirection: 'row', gap: 12, marginBottom: 12 },
  bentoItem: { flex: 1, backgroundColor: '#FFF', borderRadius: 20, padding: 16, shadowColor: "#000", shadowOffset: {width:0, height:2}, shadowOpacity:0.03, shadowRadius:6, elevation: 1 },
  bentoHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 },
  iconCircle: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  bentoTitle: { fontSize: 14, fontWeight: '700', color: THEME.textMain },
  
  focusCard: { minHeight: 140 },
  focusInput: { fontSize: 15, color: THEME.textMain, fontWeight: '500', lineHeight: 22 },
  
  waterCard: { minHeight: 140, justifyContent:'space-between' },
  waterContent: { alignItems:'center', marginVertical: 4 },
  waterCount: { fontSize: 32, fontWeight: '800', color: '#0EA5E9' },
  waterTotal: { fontSize: 16, color: '#94A3B8', fontWeight: '600' },
  waterUnit: { fontSize: 12, color: '#64748B', fontWeight: '500' },
  waterBarBg: { height: 6, backgroundColor: '#F1F5F9', borderRadius: 3, width: '100%', overflow:'hidden' },
  waterBarFill: { height: '100%', backgroundColor: '#0EA5E9', borderRadius: 3 },

  // --- Streak ---
  streakCard: {
    backgroundColor: '#fff', borderRadius: 20, padding: 16, marginBottom: 20,
    shadowColor: "#000", shadowOffset: {width:0, height:2}, shadowOpacity:0.03, shadowRadius:6, elevation: 1
  },
  streakHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  streakTitle: { fontSize: 15, fontWeight: '700', color: '#374151' },
  streakCount: { fontSize: 12, fontWeight: '700', color: '#EA580C', backgroundColor: '#FFF7ED', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12, overflow:'hidden' },
  streakGrid: { flexDirection: 'row', justifyContent: 'space-between' },
  streakBox: { width: (SCREEN_WIDTH - 80) / 14, height: 24, borderRadius: 4 }, 

  // --- Quote ---
  quoteContainer: { alignItems:'center', paddingHorizontal: 20, marginBottom: 30 },
  quoteText: { fontSize: 14, fontStyle: 'italic', color: '#94A3B8', textAlign: 'center', fontWeight: '500' },

  // --- Tasks ---
  sectionTitleNoMargin: { fontSize: 18, fontWeight: '800', color: THEME.textMain },
  sectionHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  linkText: { color: THEME.accentBlue, fontWeight: '700', fontSize: 13 },
  
  taskCard: {
    backgroundColor: '#fff', borderRadius: 18, padding: 16, flexDirection: 'row', alignItems: 'center', marginBottom: 10,
    shadowColor: "#000", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.04, shadowRadius: 8, elevation: 2
  },
  taskLeftBar: { width: 4, height: 36, backgroundColor: THEME.accentBlue, borderRadius: 2, marginRight: 14 },
  taskContent: { flex: 1 },
  taskTitle: { fontSize: 15, fontWeight: '700', color: THEME.textMain, marginBottom: 4 },
  timeTag: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#EFF6FF', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6, alignSelf: 'flex-start' },
  taskTime: { fontSize: 11, fontWeight: '700', color: THEME.accentBlue },
  taskSub: { fontSize: 13, color: '#64748B', marginTop: 6 },
  
  emptyBox: { padding: 30, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F1F5F9', borderRadius: 20, gap: 8 },
  emptyText: { color: THEME.textMain, fontWeight: '700', fontSize: 15 },
  emptySub: { color: '#94A3B8', fontWeight: '500' },

  // --- Modal ---
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', padding: 24 },
  modalContent: { backgroundColor: '#fff', borderRadius: 24, padding: 24, alignItems: 'center' },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', width: '100%', marginBottom: 20 },
  modalTitle: { fontSize: 20, fontWeight: '800', color: THEME.textMain },
  modalAvatar: { width: 90, height: 90, borderRadius: 45 },
  modalAvatarPlaceholder: { width: 90, height: 90, borderRadius: 45, backgroundColor: '#F1F5F9', justifyContent:'center', alignItems:'center' },
  changePhotoBadge: { position: 'absolute', bottom: 0, right: 0, backgroundColor: THEME.accentBlue, width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center', borderWidth: 3, borderColor: '#FFF' },
  inputLabel: { fontSize: 12, fontWeight: '700', color: '#475569', marginBottom: 6, marginLeft: 4, textTransform:'uppercase' },
  input: { backgroundColor: '#F8FAFC', padding: 14, borderRadius: 12, width: '100%', fontSize: 15, borderWidth: 1, borderColor: '#E2E8F0', color: THEME.textMain },
  btnSave: { marginTop: 20, width:'100%', padding: 16, borderRadius: 14, backgroundColor: THEME.textMain, alignItems: 'center' },
  btnTextWhite: { fontWeight: '700', fontSize: 15, color: '#fff' },
});