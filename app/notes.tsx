import { Feather, Ionicons, MaterialCommunityIcons, MaterialIcons } from '@expo/vector-icons';
import { Audio } from 'expo-av';
import * as Clipboard from 'expo-clipboard';
import * as FileSystem from 'expo-file-system';
import * as Linking from 'expo-linking';
import * as Print from 'expo-print';
import { useShareIntent } from 'expo-share-intent';
import * as Sharing from 'expo-sharing';
import React, { useEffect, useRef, useState } from 'react';
import {
  Alert,
  Animated,
  Easing,
  FlatList,
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  PanResponder,
  Platform,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { theme } from '../src/theme/theme';

// ==========================================
// 1. TYPES & DATA STRUCTURES
// ==========================================

type RecurrenceType = 'none' | 'daily' | 'weekly' | 'monthly' | 'yearly';

type Note = {
  id: string;
  title: string;
  content: string;
  createdAt: string;
  isLocked: boolean;
  password?: string;
  recurrence?: RecurrenceType;
};

type LinkItem = {
  id: string;
  url: string;
  title: string;
  description: string;
  createdAt: string;
};

type VoiceNote = {
  id: string;
  uri: string;
  name: string;
  createdAt: string;
  durationSeconds: number;
  isLocked: boolean;
  password?: string;
};

type AppDataStore = {
  notes: Note[];
  links: LinkItem[];
  voiceNotes: VoiceNote[];
};

// @ts-ignore
const docDir = FileSystem.documentDirectory || ''; 
const DATA_FILE_URI = docDir + 'app_data_notes_v12.json';

// ==========================================
// 2. HELPER FUNCTIONS & STORAGE
// ==========================================

const formatTime = (seconds: number) => {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m < 10 ? '0' : ''}${m}:${s < 10 ? '0' : ''}${s}`;
};

const formatDateTime = (isoString: string) => {
  const date = new Date(isoString);
  return date.toLocaleDateString() + ' • ' + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
};

// Calculates the next date based on recurrence type
const calculateNextOccurrence = (currentDateStr: string, type: RecurrenceType): string => {
  const d = new Date(currentDateStr);
  if (type === 'daily') d.setDate(d.getDate() + 1);
  if (type === 'weekly') d.setDate(d.getDate() + 7);
  if (type === 'monthly') d.setMonth(d.getMonth() + 1);
  if (type === 'yearly') d.setFullYear(d.getFullYear() + 1);
  return d.toISOString();
};

// --- PERSISTENCE HELPERS ---

// 1. Move voice note files to permanent storage
const moveFileToPermanentStorage = async (tempUri: string): Promise<string> => {
  try {
    const fileName = tempUri.split('/').pop();
    // @ts-ignore
    const newPath = FileSystem.documentDirectory + fileName;
    
    // Check if file exists to prevent errors
    const fileInfo = await FileSystem.getInfoAsync(newPath);
    if (!fileInfo.exists) {
        await FileSystem.moveAsync({
            from: tempUri,
            to: newPath
        });
    }
    return newPath;
  } catch (error) {
    console.log('Error moving file:', error);
    return tempUri; // Fallback
  }
};

// 2. Save entire state (Notes + Links + Voice Metadata) to JSON
const saveToJSON = async (data: AppDataStore) => {
  if (!docDir) return;
  try {
    await FileSystem.writeAsStringAsync(DATA_FILE_URI, JSON.stringify(data), { encoding: 'utf8' });
  } catch (error) {
    console.error('Error saving data:', error);
  }
};

// 3. Load with safety check to prevent overwriting with empty data
const loadFromJSON = async (): Promise<AppDataStore> => {
  if (!docDir) return { notes: [], links: [], voiceNotes: [] };
  try {
    const info = await FileSystem.getInfoAsync(DATA_FILE_URI);
    if (!info.exists) return { notes: [], links: [], voiceNotes: [] };
    
    const content = await FileSystem.readAsStringAsync(DATA_FILE_URI, { encoding: 'utf8' });
    const parsed = JSON.parse(content);
    
    // SAFETY MERGE: Ensure all arrays exist even if file is old
    return {
        notes: parsed.notes || [],
        links: parsed.links || [],
        voiceNotes: parsed.voiceNotes || []
    };
  } catch (error) {
    console.log('Load Error:', error);
    return { notes: [], links: [], voiceNotes: [] };
  }
};

// ==========================================
// 3. MAIN COMPONENT
// ==========================================

export default function NotesScreen() {
  const [activeTab, setActiveTab] = useState<'notes' | 'readLater' | 'voice'>('notes');
  const [data, setData] = useState<AppDataStore>({ notes: [], links: [], voiceNotes: [] });
  const [loading, setLoading] = useState(true);

  // Recording State
  const [activeRecording, setActiveRecording] = useState<Audio.Recording | null>(null);
  const [recordingTimer, setRecordingTimer] = useState(0);

  // --- INIT LOAD ---
  useEffect(() => {
    loadFromJSON().then((loadedData) => {
      setData(loadedData);
      setLoading(false);
    });
  }, []);

  // --- AUTO SAVE ON CHANGE ---
  useEffect(() => {
    // Only save if we are NOT loading. This prevents overwriting data with empty state on startup.
    if (!loading) {
        saveToJSON(data);
    }
  }, [data, loading]);

  // --- RECORDING FUNCTIONS ---
  const startGlobalRecording = async () => {
    try {
      const perm = await Audio.requestPermissionsAsync();
      if (perm.status !== 'granted') {
        Alert.alert('Permission needed', 'Microphone access is required to record.');
        return;
      }
      await Audio.setAudioModeAsync({ allowsRecordingIOS: true, playsInSilentModeIOS: true, staysActiveInBackground: true });
      const { recording } = await Audio.Recording.createAsync(Audio.RecordingOptionsPresets.HIGH_QUALITY);
      recording.setOnRecordingStatusUpdate((status) => {
        if (status.isRecording) setRecordingTimer(Math.floor(status.durationMillis / 1000));
      });
      await recording.setProgressUpdateInterval(1000);
      setActiveRecording(recording);
    } catch (e) {
      Alert.alert('Error', 'Failed to start recording');
    }
  };

  const stopGlobalRecording = async (): Promise<string | null> => {
    if (!activeRecording) return null;
    try {
      await activeRecording.stopAndUnloadAsync();
      const uri = activeRecording.getURI();
      activeRecording.setOnRecordingStatusUpdate(null);
      setActiveRecording(null);
      return uri;
    } catch (e) { return null; }
  };

  const resetTimer = () => setRecordingTimer(0);

  // --- UPDATE WRAPPERS ---
  const updateNotes = (newNotes: Note[]) => setData(prev => ({ ...prev, notes: newNotes }));
  const updateLinks = (newLinks: LinkItem[]) => setData(prev => ({ ...prev, links: newLinks }));
  const updateVoiceNotes = (newVoiceNotes: VoiceNote[]) => setData(prev => ({ ...prev, voiceNotes: newVoiceNotes }));

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <View>
          <Text style={styles.headerTitle}>My Notebook</Text>
          <Text style={styles.headerSubtitle}>Capture your thoughts</Text>
        </View>
        <TouchableOpacity style={styles.headerIconBtn}>
          <Ionicons name="settings-outline" size={24} color={theme.colors.text} />
        </TouchableOpacity>
      </View>

      <View style={styles.tabBar}>
        <TabButton title="Notes" icon="document-text-outline" active={activeTab === 'notes'} onPress={() => setActiveTab('notes')} />
        <TabButton title="Read Later" icon="bookmarks-outline" active={activeTab === 'readLater'} onPress={() => setActiveTab('readLater')} />
        <TabButton 
          title={activeRecording ? "Recording..." : "Voice"} 
          icon={activeRecording ? "mic" : "mic-outline"} 
          active={activeTab === 'voice'} 
          onPress={() => setActiveTab('voice')}
          extraStyle={activeRecording ? { borderColor: theme.colors.danger, borderWidth: 1 } : {}}
          textStyle={activeRecording ? { color: theme.colors.danger } : {}} 
        />
      </View>

      <View style={styles.content}>
        {activeTab === 'notes' && <NotesTab notes={data.notes} setNotes={updateNotes} />}
        {activeTab === 'readLater' && <ReadLaterTab links={data.links} setLinks={updateLinks} />}
        {activeTab === 'voice' && (
          <VoiceTab 
            voiceNotes={data.voiceNotes} 
            setVoiceNotes={updateVoiceNotes}
            activeRecording={activeRecording}
            activeTimer={recordingTimer}
            onStartRecording={startGlobalRecording}
            onStopRecording={stopGlobalRecording}
            onResetTimer={resetTimer}
          />
        )}
      </View>
    </SafeAreaView>
  );
}

// ==========================================
// 4. TAB 1: NOTES (LOGIC FIXED HERE)
// ==========================================

const NotesTab = ({ notes, setNotes }: { notes: Note[], setNotes: (n: Note[]) => void }) => {
  const [search, setSearch] = useState('');
  const [modalVisible, setModalVisible] = useState(false);
  const [authVisible, setAuthVisible] = useState(false);
  const [authPin, setAuthPin] = useState('');
  const [pendingNote, setPendingNote] = useState<Note | null>(null);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [isLocked, setIsLocked] = useState(false);
  const [pin, setPin] = useState('');
  const [recurrence, setRecurrence] = useState<RecurrenceType>('none');

  const contentInputRef = useRef<TextInput>(null);
  const filteredNotes = notes.filter(n => n.title.toLowerCase().includes(search.toLowerCase()));

  // 1. EDIT NOTE
  const handleNotePress = (note: Note) => {
    if (note.isLocked) {
      setPendingNote(note);
      setAuthPin('');
      setAuthVisible(true);
    } else {
      openEditor(note);
    }
  };

  const verifyPin = () => {
    if (pendingNote && authPin === pendingNote.password) {
      setAuthVisible(false);
      openEditor(pendingNote);
      setPendingNote(null);
    } else {
      Alert.alert('Access Denied', 'Incorrect PIN');
      setAuthPin('');
    }
  };

  const openEditor = (note?: Note) => {
    if (note) {
      setEditingId(note.id);
      setTitle(note.title);
      setContent(note.content);
      setIsLocked(note.isLocked);
      setPin(note.password || '');
      setRecurrence(note.recurrence || 'none');
    } else {
      setEditingId(null);
      setTitle('');
      setContent('');
      setIsLocked(false);
      setPin('');
      setRecurrence('none');
    }
    setModalVisible(true);
  };

  const saveNote = () => {
    if (!title.trim()) {
      Alert.alert('Details Missing', 'Please add a title.');
      return;
    }
    if (isLocked && (pin.length !== 4 || isNaN(Number(pin)))) {
      Alert.alert('Invalid PIN', 'Please enter a 4-digit numeric PIN.');
      return;
    }

    const newNote: Note = {
      id: editingId || Date.now().toString(),
      title,
      content,
      createdAt: editingId ? (notes.find(n => n.id === editingId)?.createdAt || new Date().toISOString()) : new Date().toISOString(),
      isLocked,
      password: isLocked ? pin : undefined,
      recurrence: recurrence
    };

    if (editingId) {
      setNotes(notes.map(n => n.id === editingId ? newNote : n));
    } else {
      setNotes([newNote, ...notes]);
    }
    setModalVisible(false);
  };

  // 2. COMPLETE / DELETE LOGIC
  const performAction = (action: 'complete' | 'delete', note: Note) => {
    const isRecurring = note.recurrence && note.recurrence !== 'none';
    const actionLabel = action === 'complete' ? 'Complete' : 'Delete';

    if (isRecurring) {
        Alert.alert(
            `Recurring Task (${note.recurrence})`,
            `Do you want to ${actionLabel.toLowerCase()} just this instance, or all upcoming ones?`,
            [
                { text: 'Cancel', style: 'cancel' },
                { 
                    text: `${actionLabel} This Only`, 
                    onPress: () => {
                        // Reschedule to next occurrence
                        const nextDate = calculateNextOccurrence(note.createdAt, note.recurrence!);
                        const updatedNote = { ...note, createdAt: nextDate };
                        setNotes(notes.map(n => n.id === note.id ? updatedNote : n));
                    }
                },
                { 
                    text: `${actionLabel} All Future`, 
                    style: 'destructive',
                    onPress: () => {
                        setNotes(notes.filter(n => n.id !== note.id));
                    }
                }
            ]
        );
    } else {
        Alert.alert(
            actionLabel,
            `Are you sure you want to ${actionLabel.toLowerCase()} this note?`,
            [
                { text: 'Cancel', style: 'cancel' },
                { 
                    text: `Yes, ${actionLabel}`, 
                    style: 'destructive',
                    onPress: () => setNotes(notes.filter(n => n.id !== note.id))
                }
            ]
        );
    }
  };

  const insertText = (textToInsert: string) => setContent(prev => prev + textToInsert);

  const shareNote = async (note: Note) => {
      try {
        const html = `<h1>${note.title}</h1><p>${note.content.replace(/\n/g, '<br>')}</p>`;
        const { uri } = await Print.printToFileAsync({ html });
        await Sharing.shareAsync(uri, { UTI: '.pdf', mimeType: 'application/pdf' });
      } catch(e) { Alert.alert('Error', 'Could not share note'); }
  };

  const toggleRecurrence = () => {
      const types: RecurrenceType[] = ['none', 'daily', 'weekly', 'monthly', 'yearly'];
      const currentIdx = types.indexOf(recurrence);
      setRecurrence(types[(currentIdx + 1) % types.length]);
  };

  return (
    <View style={styles.flex1}>
      <View style={styles.searchContainer}>
        <Ionicons name="search" size={20} color="#999" />
        <TextInput style={styles.searchInput} placeholder="Search notes..." value={search} onChangeText={setSearch} />
      </View>

      <FlatList
        data={filteredNotes}
        keyExtractor={item => item.id}
        contentContainerStyle={{ padding: 16, paddingBottom: 80 }}
        renderItem={({ item }) => (
          <SwipeableItem 
            onSwipeRight={() => performAction('delete', item)}
            onSwipeLeft={() => handleNotePress(item)}
            onPress={() => handleNotePress(item)}
          >
            <View style={styles.noteCard}>
                <View style={styles.noteCardHeader}>
                  <Text style={styles.noteCardTitle} numberOfLines={1}>{item.title}</Text>
                  <View style={styles.row}>
                     {item.recurrence && item.recurrence !== 'none' && (
                        <View style={styles.recurrenceBadge}>
                           <MaterialCommunityIcons name="update" size={14} color="#fff" />
                        </View>
                     )}
                     {item.isLocked && <Ionicons name="lock-closed" size={16} color={theme.colors.danger} style={{marginLeft: 6}} />}
                  </View>
                </View>
                <Text style={styles.noteCardPreview} numberOfLines={2}>
                  {item.isLocked ? 'Locked content' : item.content}
                </Text>
                <View style={styles.noteCardFooter}>
                  <Text style={styles.noteDate}>
                      {item.recurrence && item.recurrence !== 'none' ? `${item.recurrence} • ` : ''} 
                      {formatDateTime(item.createdAt)}
                  </Text>
                  
                  <View style={styles.row}>
                      <TouchableOpacity onPress={() => performAction('complete', item)} style={{ padding: 4, marginRight: 8 }}>
                          <Ionicons name="checkmark-circle-outline" size={22} color={theme.colors.primary} />
                      </TouchableOpacity>
                      <TouchableOpacity onPress={() => shareNote(item)} style={{ padding: 4 }}>
                          <Ionicons name="share-social-outline" size={18} color={theme.colors.primary} />
                      </TouchableOpacity>
                  </View>
                </View>
            </View>
          </SwipeableItem>
        )}
      />

      <TouchableOpacity style={styles.fab} onPress={() => openEditor()}>
        <Ionicons name="add" size={32} color="#FFF" />
      </TouchableOpacity>

      {/* Editor Modal - SAFE AREA FIXED */}
      <Modal visible={modalVisible} animationType="slide" presentationStyle="pageSheet">
        <SafeAreaView style={{ flex: 1, backgroundColor: '#fff' }}> 
            <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
            <View style={styles.modalHeader}>
                <TouchableOpacity onPress={() => setModalVisible(false)}><Text style={styles.modalCancel}>Cancel</Text></TouchableOpacity>
                <Text style={styles.modalTitle}>{editingId ? 'Edit Note' : 'New Note'}</Text>
                <TouchableOpacity onPress={saveNote}><Text style={styles.modalSave}>Done</Text></TouchableOpacity>
            </View>
            <ScrollView style={styles.editorContainer}>
                <TextInput style={styles.editorTitle} placeholder="Title" value={title} onChangeText={setTitle} placeholderTextColor="#999"/>
                
                <TouchableOpacity onPress={toggleRecurrence} style={styles.recurrenceSelector}>
                    <View style={styles.row}>
                        <MaterialCommunityIcons name="calendar-refresh" size={20} color={recurrence !== 'none' ? theme.colors.primary : '#999'} />
                        <Text style={[styles.lockLabel, { marginLeft: 8 }]}>Repeat Task</Text>
                    </View>
                    <Text style={{ color: recurrence !== 'none' ? theme.colors.primary : '#999', fontWeight: '600', textTransform: 'capitalize' }}>
                        {recurrence === 'none' ? 'Never' : recurrence}
                    </Text>
                </TouchableOpacity>

                <View style={styles.lockToggleRow}>
                    <View style={styles.row}>
                    <Ionicons name={isLocked ? "lock-closed" : "lock-open-outline"} size={20} color={isLocked ? theme.colors.primary : '#999'} />
                    <Text style={styles.lockLabel}> Password Protect</Text>
                    </View>
                    <Switch value={isLocked} onValueChange={setIsLocked} trackColor={{true: theme.colors.primary}} />
                </View>
                {isLocked && <TextInput style={styles.pinInput} placeholder="Enter 4-digit PIN" value={pin} onChangeText={t => { if(t.length <= 4) setPin(t.replace(/[^0-9]/g, '')) }} keyboardType="numeric" secureTextEntry />}
                <TextInput ref={contentInputRef} style={styles.editorContent} placeholder="Start typing..." value={content} onChangeText={setContent} multiline textAlignVertical="top" placeholderTextColor="#ccc"/>
                <View style={{height: 60}} />
            </ScrollView>
            <View style={styles.toolbar}>
                <TouchableOpacity onPress={() => insertText('\n• ')} style={styles.toolBtn}><MaterialCommunityIcons name="format-list-bulleted" size={24} color="#333" /></TouchableOpacity>
                <TouchableOpacity onPress={() => insertText('\n☐ ')} style={styles.toolBtn}><MaterialCommunityIcons name="checkbox-blank-outline" size={24} color="#333" /></TouchableOpacity>
                <TouchableOpacity onPress={() => insertText(`\n___\n`)} style={styles.toolBtn}><MaterialCommunityIcons name="minus" size={24} color="#333" /></TouchableOpacity>
                <TouchableOpacity onPress={() => Keyboard.dismiss()} style={[styles.toolBtn, { marginLeft: 'auto' }]}><Ionicons name="chevron-down" size={24} color="#333" /></TouchableOpacity>
            </View>
            </KeyboardAvoidingView>
        </SafeAreaView>
      </Modal>

      <Modal visible={authVisible} transparent animationType="fade">
        <View style={styles.modalOverlay}>
           <View style={styles.miniModal}>
              <Text style={styles.miniTitle}>Locked Note</Text>
              <TextInput style={[styles.pinInput, { backgroundColor: '#fff', borderWidth:1, borderColor:'#ddd' }]} placeholder="____" value={authPin} onChangeText={t => { if(t.length <= 4) setAuthPin(t.replace(/[^0-9]/g, '')) }} keyboardType="numeric" secureTextEntry autoFocus />
              <View style={styles.modalBtnRow}>
                <TouchableOpacity onPress={() => { setAuthVisible(false); setAuthPin(''); }} style={styles.cancelBtn}><Text style={{color: '#666'}}>Cancel</Text></TouchableOpacity>
                <TouchableOpacity onPress={verifyPin} style={styles.saveBtn}><Text style={{color: '#FFF', fontWeight:'bold'}}>Unlock</Text></TouchableOpacity>
              </View>
           </View>
        </View>
      </Modal>
    </View>
  );
};

// ==========================================
// 5. TAB 2: READ LATER
// ==========================================

const ReadLaterTab = ({ links, setLinks }: { links: LinkItem[], setLinks: (l: LinkItem[]) => void }) => {
  const [modalVisible, setModalVisible] = useState(false);
  const [url, setUrl] = useState('');
  const [title, setTitle] = useState('');
  const [desc, setDesc] = useState('');
  const [editingLink, setEditingLink] = useState<LinkItem | null>(null);
  const { hasShareIntent, shareIntent, resetShareIntent } = useShareIntent();

  useEffect(() => {
    if (hasShareIntent && (shareIntent.type === 'text' || shareIntent.type === 'weburl')) {
      const sharedUrl = (shareIntent as any).value || (shareIntent as any).text || '';
      if(sharedUrl) { setUrl(sharedUrl); setModalVisible(true); }
      resetShareIntent();
    }
  }, [hasShareIntent]);

  const handleSave = () => {
    if(!url) return;
    const newItem: LinkItem = editingLink 
      ? { ...editingLink, url, title: title || url, description: desc }
      : { id: Date.now().toString(), url, title: title || url, description: desc, createdAt: new Date().toISOString() };
    
    if (editingLink) setLinks(links.map(l => l.id === editingLink.id ? newItem : l));
    else setLinks([newItem, ...links]);
    resetForm();
  };

  const resetForm = () => { setUrl(''); setTitle(''); setDesc(''); setEditingLink(null); setModalVisible(false); };
  const pasteUrl = async () => { const text = await Clipboard.getStringAsync(); if(text) setUrl(text); };
  
  return (
    <View style={styles.flex1}>
      <FlatList
        data={links}
        keyExtractor={item => item.id}
        contentContainerStyle={{ padding: 16 }}
        renderItem={({ item }) => (
          <SwipeableItem
            onSwipeRight={() => setLinks(links.filter(l => l.id !== item.id))}
            onSwipeLeft={() => { setEditingLink(item); setUrl(item.url); setTitle(item.title); setDesc(item.description); setModalVisible(true); }}
            onPress={() => Linking.openURL(item.url)}
          >
            <View style={styles.linkCard}>
               <View style={styles.linkHeader}>
                 <View style={styles.iconCircle}><Feather name="link" size={20} color={theme.colors.primary} /></View>
                 <View style={{flex: 1, marginLeft: 10}}>
                    <Text style={styles.linkTitle} numberOfLines={1}>{item.title}</Text>
                    {!!item.description && <Text style={styles.linkDesc} numberOfLines={1}>{item.description}</Text>}
                 </View>
               </View>
               <View style={{flexDirection:'row', alignItems:'center', marginTop:8}}>
                 <Text style={[styles.visitBtnText, {color: theme.colors.primary, fontSize:12}]}>Tap to Visit</Text>
                 <Ionicons name="arrow-forward" size={12} color={theme.colors.primary} />
               </View>
            </View>
          </SwipeableItem>
        )}
      />
      <TouchableOpacity style={styles.fab} onPress={() => setModalVisible(true)}><Ionicons name="add" size={32} color="#FFF" /></TouchableOpacity>

      <Modal visible={modalVisible} transparent animationType="fade">
        <View style={styles.modalOverlay}>
           <View style={styles.miniModal}>
              <Text style={styles.miniTitle}>{editingLink ? 'Edit Link' : 'Add New Link'}</Text>
              <View style={styles.inputWithIcon}>
                 <TextInput style={[styles.miniInput, {flex: 1, marginBottom: 0}]} placeholder="https://example.com" value={url} onChangeText={setUrl} autoCapitalize="none"/>
                 <TouchableOpacity onPress={pasteUrl} style={{padding: 8}}><Text style={{color: theme.colors.primary, fontWeight:'600'}}>PASTE</Text></TouchableOpacity>
              </View>
              <TextInput style={styles.miniInput} placeholder="Title" value={title} onChangeText={setTitle} />
              <TextInput style={[styles.miniInput, { height: 60 }]} placeholder="Description" value={desc} onChangeText={setDesc} multiline />
              <View style={styles.modalBtnRow}>
                <TouchableOpacity onPress={resetForm} style={styles.cancelBtn}><Text style={{color: '#666'}}>Cancel</Text></TouchableOpacity>
                <TouchableOpacity onPress={handleSave} style={styles.saveBtn}><Text style={{color: '#FFF', fontWeight:'bold'}}>Save</Text></TouchableOpacity>
              </View>
           </View>
        </View>
      </Modal>
    </View>
  );
};

// ==========================================
// 6. TAB 3: VOICE NOTES (FIXED PERSISTENCE)
// ==========================================

const VoiceTab = ({ voiceNotes, setVoiceNotes, activeRecording, activeTimer, onStartRecording, onStopRecording, onResetTimer }: any) => {
  const [sound, setSound] = useState<Audio.Sound | null>(null);
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [isLooping, setIsLooping] = useState(false);
  const recordingAnim = useRef(new Animated.Value(1)).current;
  const playbackAnim = useRef(new Animated.Value(0)).current;

  // Modals
  const [saveModalVisible, setSaveModalVisible] = useState(false);
  const [tempUri, setTempUri] = useState<string | null>(null);
  const [saveName, setSaveName] = useState('');
  const [saveLocked, setSaveLocked] = useState(false);
  const [savePin, setSavePin] = useState('');
  const [unlockVisible, setUnlockVisible] = useState(false);
  const [unlockPin, setUnlockPin] = useState('');
  const [noteToPlay, setNoteToPlay] = useState<VoiceNote | null>(null);
  const [renameVisible, setRenameVisible] = useState(false);
  const [renameId, setRenameId] = useState<string|null>(null);
  const [newName, setNewName] = useState('');

  // Animations
  useEffect(() => {
    if (activeRecording) {
        Animated.loop(Animated.sequence([
          Animated.timing(recordingAnim, { toValue: 1.2, duration: 800, useNativeDriver: true }),
          Animated.timing(recordingAnim, { toValue: 1, duration: 800, useNativeDriver: true }),
        ])).start();
    } else recordingAnim.setValue(1);
  }, [activeRecording]);

  useEffect(() => {
    if (playingId) {
      Animated.loop(Animated.sequence([
          Animated.timing(playbackAnim, { toValue: 1, duration: 500, easing: Easing.linear, useNativeDriver: true }),
          Animated.timing(playbackAnim, { toValue: 0.3, duration: 500, easing: Easing.linear, useNativeDriver: true })
      ])).start();
    } else playbackAnim.setValue(1);
  }, [playingId]);

  useEffect(() => { return () => { if(sound) sound.unloadAsync(); }; }, []);

  const handleStopRecording = async () => {
    const uri = await onStopRecording();
    if (uri) { setTempUri(uri); setSaveName(`Voice Memo ${voiceNotes.length + 1}`); setSaveLocked(false); setSavePin(''); setSaveModalVisible(true); }
  };

  const finalizeSave = async () => {
    if (saveLocked && (savePin.length !== 4 || isNaN(Number(savePin)))) { Alert.alert('Invalid PIN', 'Please enter 4 digits.'); return; }
    
    if(tempUri) {
      // --- FIX: Move file to permanent storage ---
      const permanentUri = await moveFileToPermanentStorage(tempUri);
      const note: VoiceNote = { id: Date.now().toString(), uri: permanentUri, name: saveName, createdAt: new Date().toISOString(), durationSeconds: activeTimer, isLocked: saveLocked, password: saveLocked ? savePin : undefined };
      setVoiceNotes([note, ...voiceNotes]);
    }
    setSaveModalVisible(false); onResetTimer(); 
  };

  const playAudio = async (item: VoiceNote) => {
    if(playingId === item.id && sound) { await sound.stopAsync(); setPlayingId(null); return; }
    if(sound) { await sound.unloadAsync(); setSound(null); setPlayingId(null); }
    try {
       await Audio.setAudioModeAsync({ allowsRecordingIOS: false, playsInSilentModeIOS: true, staysActiveInBackground: true });
       const { sound: newSound } = await Audio.Sound.createAsync({ uri: item.uri }, { isLooping });
       setSound(newSound); setPlayingId(item.id); await newSound.playAsync();
       newSound.setOnPlaybackStatusUpdate(status => { if(status.isLoaded && status.didJustFinish && !status.isLooping) setPlayingId(null); });
    } catch(e) { Alert.alert('Error', 'File not found'); }
  };

  const handlePlayPress = (item: VoiceNote) => {
    if(item.isLocked) { setNoteToPlay(item); setUnlockPin(''); setUnlockVisible(true); } else playAudio(item);
  };

  const verifyUnlock = () => {
    if(noteToPlay && unlockPin === noteToPlay.password) { setUnlockVisible(false); playAudio(noteToPlay); setNoteToPlay(null); }
    else Alert.alert('Error', 'Incorrect PIN');
  };

  const shareAudio = async (item: VoiceNote) => {
    if (!(await Sharing.isAvailableAsync())) return;
    await Sharing.shareAsync(item.uri, { dialogTitle: `Share ${item.name}` });
  };

  return (
    <View style={styles.flex1}>
      <View style={styles.modernRecorder}>
        <View style={{flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20}}>
            <View>
                <Text style={styles.modernTimerLabel}>{activeRecording ? 'RECORDING' : 'READY'}</Text>
                <Text style={styles.modernTimerText}>{formatTime(activeTimer)}</Text>
            </View>
            <TouchableOpacity onPress={activeRecording ? handleStopRecording : onStartRecording}>
                <Animated.View style={[styles.recordButtonOuter, activeRecording ? { transform: [{ scale: recordingAnim }], borderColor: theme.colors.danger } : {}]}>
                    <View style={[styles.recordButtonInner, { backgroundColor: activeRecording ? theme.colors.danger : theme.colors.primary }]}>
                          {activeRecording && <View style={styles.stopSquare} />}
                    </View>
                </Animated.View>
            </TouchableOpacity>
        </View>
      </View>

      <View style={styles.listContainer}>
          <View style={styles.listHeader}><Text style={styles.listHeaderTitle}>YOUR RECORDINGS ({voiceNotes.length})</Text></View>
          <FlatList
            data={voiceNotes}
            keyExtractor={item => item.id}
            contentContainerStyle={{ paddingBottom: 40 }}
            ItemSeparatorComponent={() => <View style={styles.listSeparator} />}
            renderItem={({ item }) => (
              <SwipeableItem 
                onSwipeRight={() => setVoiceNotes(voiceNotes.filter((v: VoiceNote) => v.id !== item.id))} 
                onSwipeLeft={() => { setRenameId(item.id); setNewName(item.name); setRenameVisible(true); }}
              >
                <View style={[styles.listViewItem, playingId === item.id && { backgroundColor: '#F0F9FF' }]}>
                    <TouchableOpacity onPress={() => handlePlayPress(item)} style={[styles.listPlayBtn, playingId === item.id && { backgroundColor: theme.colors.primary }]}>
                        <Ionicons name={playingId === item.id ? "pause" : "play"} size={18} color={playingId === item.id ? "#FFF" : theme.colors.primary} />
                    </TouchableOpacity>
                    <View style={{flex: 1, paddingHorizontal: 12}}>
                        <Text style={[styles.listTitle, playingId === item.id && { color: theme.colors.primary }]} numberOfLines={1}>{item.name}</Text>
                        <View style={{flexDirection: 'row', alignItems: 'center', marginTop: 4}}>
                           <Text style={styles.listSub}>{new Date(item.createdAt).toLocaleDateString()} • {formatTime(item.durationSeconds)}</Text>
                           {playingId === item.id && ( <View style={{flexDirection:'row', marginLeft: 8, alignItems: 'flex-end', height: 12, gap: 2}}>{[1,2,3,4].map(i => <Animated.View key={i} style={{width: 2, height: 8, backgroundColor: theme.colors.primary, opacity: playbackAnim}} />)}</View>)}
                        </View>
                    </View>
                    <View style={{flexDirection:'row', alignItems:'center'}}>
                        {item.isLocked && <Ionicons name="lock-closed" size={14} color={theme.colors.danger} style={{marginRight: 10}} />}
                        <TouchableOpacity onPress={() => shareAudio(item)} style={{padding: 6}}><Ionicons name="share-social-outline" size={18} color="#9CA3AF" /></TouchableOpacity>
                        <TouchableOpacity onPress={() => { setIsLooping(!isLooping); if(sound) sound.setIsLoopingAsync(!isLooping); }} style={{padding: 6}}><MaterialCommunityIcons name="repeat" size={18} color={isLooping && playingId === item.id ? theme.colors.primary : "#ccc"} /></TouchableOpacity>
                    </View>
                </View>
              </SwipeableItem>
            )}
          />
      </View>

      {/* MODALS */}
      <Modal visible={saveModalVisible} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.miniModal}>
            <Text style={styles.miniTitle}>Save Recording</Text>
            <TextInput style={styles.miniInput} value={saveName} onChangeText={setSaveName} placeholder="Name" />
            <View style={[styles.lockToggleRow, { borderBottomWidth:0 }]}><Text style={styles.lockLabel}>Lock?</Text><Switch value={saveLocked} onValueChange={setSaveLocked} trackColor={{true: theme.colors.primary}} /></View>
            {saveLocked && <TextInput style={[styles.miniInput, {textAlign:'center', fontWeight:'bold'}]} placeholder="PIN" value={savePin} onChangeText={setSavePin} keyboardType="numeric" secureTextEntry />}
            <View style={styles.modalBtnRow}>
                <TouchableOpacity onPress={() => { setSaveModalVisible(false); onResetTimer(); }} style={styles.cancelBtn}><Text style={{color: '#666'}}>Discard</Text></TouchableOpacity>
                <TouchableOpacity onPress={finalizeSave} style={styles.saveBtn}><Text style={{color: '#FFF', fontWeight:'bold'}}>Save</Text></TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={unlockVisible} transparent animationType="fade">
        <View style={styles.modalOverlay}>
           <View style={styles.miniModal}>
              <Text style={styles.miniTitle}>Locked</Text>
              <TextInput style={[styles.pinInput, { backgroundColor: '#fff', borderWidth:1, borderColor:'#ddd' }]} placeholder="PIN" value={unlockPin} onChangeText={setUnlockPin} keyboardType="numeric" secureTextEntry autoFocus />
              <View style={styles.modalBtnRow}>
                <TouchableOpacity onPress={() => setUnlockVisible(false)} style={styles.cancelBtn}><Text style={{color: '#666'}}>Cancel</Text></TouchableOpacity>
                <TouchableOpacity onPress={verifyUnlock} style={styles.saveBtn}><Text style={{color: '#FFF', fontWeight:'bold'}}>Play</Text></TouchableOpacity>
              </View>
           </View>
        </View>
      </Modal>

      <Modal visible={renameVisible} transparent animationType="fade">
        <View style={styles.modalOverlay}>
           <View style={styles.miniModal}>
              <Text style={styles.miniTitle}>Rename</Text>
              <TextInput style={styles.miniInput} value={newName} onChangeText={setNewName} />
              <View style={styles.modalBtnRow}>
                <TouchableOpacity onPress={() => setRenameVisible(false)} style={styles.cancelBtn}><Text style={{color: '#666'}}>Cancel</Text></TouchableOpacity>
                <TouchableOpacity onPress={() => { if(renameId) setVoiceNotes(voiceNotes.map((v: VoiceNote) => v.id === renameId ? {...v, name: newName} : v)); setRenameVisible(false); }} style={styles.saveBtn}><Text style={{color: '#FFF', fontWeight:'bold'}}>Rename</Text></TouchableOpacity>
              </View>
           </View>
        </View>
      </Modal>
    </View>
  );
};

// ==========================================
// 7. SWIPEABLE ITEM
// ==========================================

const SwipeableItem = ({ children, onSwipeRight, onSwipeLeft, onPress }: { children: React.ReactNode, onSwipeRight: () => void, onSwipeLeft: () => void, onPress?: () => void }) => {
  const pan = useRef(new Animated.ValueXY()).current;
  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (evt, gestureState) => Math.abs(gestureState.dx) > 10 && Math.abs(gestureState.dx) > Math.abs(gestureState.dy),
      onPanResponderMove: Animated.event([null, { dx: pan.x }], { useNativeDriver: false }),
      onPanResponderRelease: (evt, gestureState) => {
        if (gestureState.dx > 100) {
          Animated.timing(pan, { toValue: { x: 500, y: 0 }, duration: 200, useNativeDriver: false }).start(() => { onSwipeRight(); pan.setValue({ x: 0, y: 0 }); });
        } else if (gestureState.dx < -100) {
          Animated.timing(pan, { toValue: { x: -500, y: 0 }, duration: 200, useNativeDriver: false }).start(() => { onSwipeLeft(); Animated.spring(pan, { toValue: { x: 0, y: 0 }, friction: 5, useNativeDriver: false }).start(); });
        } else {
          Animated.spring(pan, { toValue: { x: 0, y: 0 }, friction: 5, useNativeDriver: false }).start();
        }
      }
    })
  ).current;

  return (
    <View style={styles.swipeContainer}>
      <View style={styles.swipeBackLayer}>
         <Animated.View style={[styles.swipeLeftAction, { opacity: pan.x.interpolate({ inputRange: [0, 100], outputRange: [0, 1] }) }]}>
            <Ionicons name="trash" size={24} color="#fff" /><Text style={{color:'#fff', fontWeight:'bold', marginLeft: 8}}>DELETE</Text>
         </Animated.View>
         <Animated.View style={[styles.swipeRightAction, { opacity: pan.x.interpolate({ inputRange: [-100, 0], outputRange: [1, 0] }) }]}>
            <Text style={{color:'#fff', fontWeight:'bold', marginRight: 8}}>EDIT</Text><MaterialIcons name="edit" size={24} color="#fff" />
         </Animated.View>
      </View>
      <Animated.View style={[{ transform: [{ translateX: pan.x }] }]} {...panResponder.panHandlers}>
        <TouchableOpacity activeOpacity={0.9} onPress={onPress}>{children}</TouchableOpacity>
      </Animated.View>
    </View>
  );
};

const TabButton = ({ title, icon, active, onPress, extraStyle, textStyle }: any) => (
  <TouchableOpacity onPress={onPress} style={[styles.tabBtn, active && styles.tabBtnActive, extraStyle]}>
    <Ionicons name={icon} size={20} color={active ? theme.colors.primary : '#888'} style={textStyle} />
    <Text style={[styles.tabText, active && styles.tabTextActive, textStyle]}>{title}</Text>
  </TouchableOpacity>
);

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F9FAFB' },
  flex1: { flex: 1 },
  row: { flexDirection: 'row', alignItems: 'center' },
  header: { padding: 8, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#F3F4F6' },
  headerTitle: { fontSize: 26, fontWeight: '800', color: '#111827' },
  headerSubtitle: { fontSize: 14, color: '#6B7280', marginTop: 2 },
  headerIconBtn: { padding: 8, backgroundColor: '#F3F4F6', borderRadius: 20 },
  tabBar: { flexDirection: 'row', padding: 6, margin: 16, backgroundColor: '#E5E7EB', borderRadius: 12 },
  tabBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 10, borderRadius: 10 },
  tabBtnActive: { backgroundColor: '#fff', shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 2, elevation: 1 },
  tabText: { marginLeft: 6, fontWeight: '600', color: '#6B7280', fontSize: 13 },
  tabTextActive: { color: theme.colors.primary, fontWeight: '700' },
  content: { flex: 1 },
  searchContainer: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', marginHorizontal: 16, marginBottom: 10, paddingHorizontal: 12, borderRadius: 10, borderWidth: 1, borderColor: '#E5E7EB', height: 44 },
  searchInput: { flex: 1, marginLeft: 8, fontSize: 16, color: '#333' },
  fab: { position: 'absolute', bottom: 24, right: 24, width: 60, height: 60, borderRadius: 30, backgroundColor: theme.colors.primary, justifyContent: 'center', alignItems: 'center', shadowColor: theme.colors.primary, shadowOpacity: 0.4, shadowOffset: {width:0, height:4}, shadowRadius: 8, elevation: 6 },
  swipeContainer: { marginHorizontal: 16, position: 'relative' },
  swipeBackLayer: { position: 'absolute', top: 0, bottom: 0, left: 0, right: 0, borderRadius: 0, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  swipeLeftAction: { backgroundColor: '#EF4444', position: 'absolute', left: 0, top: 0, bottom: 0, width: '100%', justifyContent: 'flex-start', alignItems:'center', flexDirection:'row', paddingLeft: 20 },
  swipeRightAction: { backgroundColor: '#3B82F6', position: 'absolute', right: 0, top: 0, bottom: 0, width: '100%', justifyContent: 'flex-end', alignItems:'center', flexDirection:'row', paddingRight: 20 },
  noteCard: { backgroundColor: '#fff', borderRadius: 12, padding: 16, borderWidth: 1, borderColor: '#F3F4F6', shadowColor: '#000', shadowOpacity: 0.02, shadowRadius: 6, elevation: 1, marginBottom: 12 },
  noteCardHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 },
  noteCardTitle: { fontSize: 17, fontWeight: '700', color: '#1F2937', flex: 1 },
  noteCardPreview: { fontSize: 14, color: '#6B7280', lineHeight: 20, height: 40 },
  noteCardFooter: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: '#F9FAFB' },
  noteDate: { fontSize: 12, color: '#9CA3AF' },
  recurrenceBadge: { backgroundColor: theme.colors.primary, borderRadius: 4, padding: 2, marginRight: 4 },
  recurrenceSelector: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#F3F4F6', marginBottom: 10 },
  linkCard: { backgroundColor: '#fff', borderRadius: 12, padding: 16, borderWidth: 1, borderColor: '#E5E7EB', marginBottom: 12 },
  linkHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  iconCircle: { width: 32, height: 32, borderRadius: 16, backgroundColor: '#EFF6FF', alignItems: 'center', justifyContent: 'center' },
  linkTitle: { fontSize: 16, fontWeight: '700', color: '#1F2937' },
  linkDesc: { fontSize: 13, color: '#6B7280', marginTop: 2 },
  visitBtnText: { color: '#fff', fontWeight: '600', marginRight: 6, fontSize: 13 },
  modernRecorder: { backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#E5E7EB', paddingVertical: 20, paddingHorizontal: 16, shadowColor: '#000', shadowOpacity: 0.03, shadowRadius: 4, elevation: 2, zIndex: 10 },
  recordButtonOuter: { width: 64, height: 64, borderRadius: 32, borderWidth: 4, borderColor: '#E5E7EB', alignItems: 'center', justifyContent: 'center' },
  recordButtonInner: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
  stopSquare: { width: 16, height: 16, borderRadius: 2, backgroundColor: '#FFF' },
  modernTimerLabel: { fontSize: 12, fontWeight: '700', color: '#9CA3AF', letterSpacing: 0.5 },
  modernTimerText: { fontSize: 36, fontWeight: '200', color: '#111827', fontVariant: ['tabular-nums'] },
  listContainer: { flex: 1, backgroundColor: '#fff' },
  listHeader: { paddingHorizontal: 16, paddingVertical: 12, backgroundColor: '#F9FAFB', borderBottomWidth: 1, borderBottomColor: '#F3F4F6' },
  listHeaderTitle: { fontSize: 12, fontWeight: '700', color: '#6B7280', letterSpacing: 0.5 },
  listViewItem: { flexDirection: 'row', alignItems: 'center', padding: 16, backgroundColor: '#fff' },
  listPlayBtn: { width: 32, height: 32, borderRadius: 16, backgroundColor: '#F3F4F6', alignItems: 'center', justifyContent: 'center' },
  listTitle: { fontSize: 15, fontWeight: '600', color: '#1F2937' },
  listSub: { fontSize: 12, color: '#9CA3AF' },
  listSeparator: { height: 1, backgroundColor: '#F3F4F6', marginLeft: 60 },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, borderBottomWidth: 1, borderBottomColor: '#eee', backgroundColor: '#fff' },
  modalCancel: { fontSize: 16, color: '#6B7280' },
  modalTitle: { fontSize: 17, fontWeight: '600' },
  modalSave: { fontSize: 16, fontWeight: '700', color: theme.colors.primary },
  editorContainer: { flex: 1, padding: 20, backgroundColor: '#fff' },
  editorTitle: { fontSize: 24, fontWeight: 'bold', marginBottom: 20 },
  editorContent: { fontSize: 16, lineHeight: 24, color: '#374151', minHeight: 200 },
  lockToggleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#F3F4F6' },
  lockLabel: { fontSize: 16, fontWeight: '500', color: '#374151' },
  pinInput: { backgroundColor: '#F3F4F6', padding: 12, borderRadius: 8, fontSize: 16, marginBottom: 20, textAlign: 'center', letterSpacing: 4, fontWeight: 'bold' },
  toolbar: { flexDirection: 'row', padding: 10, backgroundColor: '#F3F4F6', borderTopWidth: 1, borderTopColor: '#E5E7EB' },
  toolBtn: { padding: 8, marginHorizontal: 4, backgroundColor: '#fff', borderRadius: 6, borderWidth: 1, borderColor: '#E5E7EB' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: 24 },
  miniModal: { backgroundColor: '#fff', borderRadius: 20, padding: 20 },
  miniTitle: { fontSize: 18, fontWeight: '700', marginBottom: 16, textAlign: 'center' },
  miniInput: { backgroundColor: '#F9FAFB', borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 10, padding: 12, fontSize: 15, marginBottom: 12 },
  inputWithIcon: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#F9FAFB', borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 10, marginBottom: 12, paddingRight: 4 },
  modalBtnRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 8 },
  cancelBtn: { flex: 1, padding: 14, alignItems: 'center', backgroundColor: '#F3F4F6', borderRadius: 10, marginRight: 8 },
  saveBtn: { flex: 1, padding: 14, alignItems: 'center', backgroundColor: theme.colors.primary, borderRadius: 10 },
});