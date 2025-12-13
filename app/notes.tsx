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

type Note = {
  id: string;
  title: string;
  content: string;
  createdAt: string;
  isLocked: boolean;
  password?: string;
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
const DATA_FILE_URI = docDir + 'app_data_notes_v9.json';

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

const saveToJSON = async (data: AppDataStore) => {
  if (!docDir) return;
  try {
    await FileSystem.writeAsStringAsync(DATA_FILE_URI, JSON.stringify(data), { encoding: 'utf8' });
  } catch (error) {
    console.error('Error saving data:', error);
  }
};

const loadFromJSON = async (): Promise<AppDataStore> => {
  if (!docDir) return { notes: [], links: [], voiceNotes: [] };
  try {
    const info = await FileSystem.getInfoAsync(DATA_FILE_URI);
    if (!info.exists) return { notes: [], links: [], voiceNotes: [] };
    const content = await FileSystem.readAsStringAsync(DATA_FILE_URI, { encoding: 'utf8' });
    return JSON.parse(content);
  } catch (error) {
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

  useEffect(() => {
    loadFromJSON().then((loadedData) => {
      setData(loadedData);
      setLoading(false);
    });
  }, []);

  useEffect(() => {
    if (!loading) saveToJSON(data);
  }, [data, loading]);

  const updateNotes = (newNotes: Note[]) => {
    setData(prev => ({ ...prev, notes: newNotes }));
  };
  
  const updateLinks = (newLinks: LinkItem[]) => {
    setData(prev => ({ ...prev, links: newLinks }));
  };

  const updateVoiceNotes = (newVoiceNotes: VoiceNote[]) => {
    setData(prev => ({ ...prev, voiceNotes: newVoiceNotes }));
  };

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
        <TabButton title="Voice" icon="mic-outline" active={activeTab === 'voice'} onPress={() => setActiveTab('voice')} />
      </View>

      <View style={styles.content}>
        {activeTab === 'notes' && <NotesTab notes={data.notes} setNotes={updateNotes} />}
        {activeTab === 'readLater' && <ReadLaterTab links={data.links} setLinks={updateLinks} />}
        {activeTab === 'voice' && <VoiceTab voiceNotes={data.voiceNotes} setVoiceNotes={updateVoiceNotes} />}
      </View>
    </SafeAreaView>
  );
}

// ==========================================
// 4. TAB 1: NOTES
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

  const contentInputRef = useRef<TextInput>(null);
  const filteredNotes = notes.filter(n => n.title.toLowerCase().includes(search.toLowerCase()));

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
    } else {
      setEditingId(null);
      setTitle('');
      setContent('');
      setIsLocked(false);
      setPin('');
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
    };

    if (editingId) {
      setNotes(notes.map(n => n.id === editingId ? newNote : n));
    } else {
      setNotes([newNote, ...notes]);
    }
    setModalVisible(false);
  };

  const deleteNote = (id: string) => {
    setNotes(notes.filter(n => n.id !== id));
  };

  const insertText = (textToInsert: string) => {
    setContent(prev => prev + textToInsert);
  };

  const shareNote = async (note: Note) => {
      try {
        const dateStr = formatDateTime(note.createdAt);
        const html = `<h1>${note.title}</h1><p>${note.content.replace(/\n/g, '<br>')}</p><p>Date: ${dateStr}</p>`;
        const { uri } = await Print.printToFileAsync({ html });
        await Sharing.shareAsync(uri, { UTI: '.pdf', mimeType: 'application/pdf' });
      } catch(e) { Alert.alert('Error', 'Could not share note'); }
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
            onSwipeRight={() => deleteNote(item.id)} 
            onSwipeLeft={() => handleNotePress(item)}
            onPress={() => handleNotePress(item)}
          >
            <View style={styles.noteCard}>
                <View style={styles.noteCardHeader}>
                  <Text style={styles.noteCardTitle} numberOfLines={1}>{item.title}</Text>
                  {item.isLocked && <Ionicons name="lock-closed" size={16} color={theme.colors.danger} />}
                </View>
                <Text style={styles.noteCardPreview} numberOfLines={2}>
                  {item.isLocked ? 'Locked content' : item.content}
                </Text>
                <View style={styles.noteCardFooter}>
                  <Text style={styles.noteDate}>{formatDateTime(item.createdAt)}</Text>
                  <TouchableOpacity onPress={() => shareNote(item)} style={{ padding: 4 }}>
                      <Ionicons name="share-social-outline" size={18} color={theme.colors.primary} />
                  </TouchableOpacity>
                </View>
            </View>
          </SwipeableItem>
        )}
      />

      <TouchableOpacity style={styles.fab} onPress={() => openEditor()}>
        <Ionicons name="add" size={32} color="#FFF" />
      </TouchableOpacity>

      {/* Editor Modal */}
      <Modal visible={modalVisible} animationType="slide" presentationStyle="pageSheet">
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
          <View style={styles.modalHeader}>
            <TouchableOpacity onPress={() => setModalVisible(false)}><Text style={styles.modalCancel}>Cancel</Text></TouchableOpacity>
            <Text style={styles.modalTitle}>{editingId ? 'Edit Note' : 'New Note'}</Text>
            <TouchableOpacity onPress={saveNote}><Text style={styles.modalSave}>Done</Text></TouchableOpacity>
          </View>
          <ScrollView style={styles.editorContainer}>
             <TextInput style={styles.editorTitle} placeholder="Title" value={title} onChangeText={setTitle} placeholderTextColor="#999"/>
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
            <TouchableOpacity onPress={() => insertText(` [${new Date().toLocaleTimeString()}] `)} style={styles.toolBtn}><Ionicons name="time-outline" size={24} color="#333" /></TouchableOpacity>
            <TouchableOpacity onPress={() => Keyboard.dismiss()} style={[styles.toolBtn, { marginLeft: 'auto' }]}><Ionicons name="chevron-down" size={24} color="#333" /></TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Auth Modal */}
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
      if(sharedUrl) {
          setUrl(sharedUrl);
          setModalVisible(true);
      }
      resetShareIntent();
    }
  }, [hasShareIntent, shareIntent, resetShareIntent]);

  const handleSave = () => {
    if(!url) return;
    if (editingLink) {
      setLinks(links.map(l => l.id === editingLink.id ? { ...l, url, title: title || url, description: desc } : l));
    } else {
      const newItem: LinkItem = {
        id: Date.now().toString(),
        url,
        title: title || url,
        description: desc,
        createdAt: new Date().toISOString()
      };
      setLinks([newItem, ...links]);
    }
    resetForm();
  };

  const resetForm = () => {
    setUrl(''); setTitle(''); setDesc(''); setEditingLink(null); setModalVisible(false);
  };

  const pasteUrl = async () => {
    const text = await Clipboard.getStringAsync();
    if(text) setUrl(text);
  };

  const deleteLink = (id: string) => {
    setLinks(links.filter(l => l.id !== id));
  };

  const editLink = (item: LinkItem) => {
    setEditingLink(item);
    setUrl(item.url);
    setTitle(item.title);
    setDesc(item.description);
    setModalVisible(true);
  };

  return (
    <View style={styles.flex1}>
      <FlatList
        data={links}
        keyExtractor={item => item.id}
        contentContainerStyle={{ padding: 16 }}
        renderItem={({ item }) => (
          <SwipeableItem
            onSwipeRight={() => deleteLink(item.id)}
            onSwipeLeft={() => editLink(item)}
            onPress={() => Linking.openURL(item.url)}
          >
            <View style={styles.linkCard}>
               <View style={styles.linkHeader}>
                 <View style={styles.iconCircle}>
                   <Feather name="link" size={20} color={theme.colors.primary} />
                 </View>
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

      <TouchableOpacity style={styles.fab} onPress={() => setModalVisible(true)}>
        <Ionicons name="add" size={32} color="#FFF" />
      </TouchableOpacity>

      <Modal visible={modalVisible} transparent animationType="fade">
        <View style={styles.modalOverlay}>
           <View style={styles.miniModal}>
              <Text style={styles.miniTitle}>{editingLink ? 'Edit Link' : 'Add New Link'}</Text>
              <View style={styles.inputWithIcon}>
                 <TextInput style={[styles.miniInput, {flex: 1, marginBottom: 0}]} placeholder="https://example.com" value={url} onChangeText={setUrl} autoCapitalize="none"/>
                 <TouchableOpacity onPress={pasteUrl} style={{padding: 8}}><Text style={{color: theme.colors.primary, fontWeight:'600'}}>PASTE</Text></TouchableOpacity>
              </View>
              <TextInput style={styles.miniInput} placeholder="Link Title" value={title} onChangeText={setTitle} />
              <TextInput style={[styles.miniInput, { height: 60 }]} placeholder="Description (Optional)" value={desc} onChangeText={setDesc} multiline />
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
// 6. TAB 3: VOICE NOTES
// ==========================================

const VoiceTab = ({ voiceNotes, setVoiceNotes }: { voiceNotes: VoiceNote[], setVoiceNotes: (v: VoiceNote[]) => void }) => {
  const [recording, setRecording] = useState<Audio.Recording | null>(null);
  const [timer, setTimer] = useState(0);
  const [sound, setSound] = useState<Audio.Sound | null>(null);
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [isLooping, setIsLooping] = useState(false);

  // Animations
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

  // Rename Modal
  const [renameVisible, setRenameVisible] = useState(false);
  const [renameId, setRenameId] = useState<string|null>(null);
  const [newName, setNewName] = useState('');

  const timerRef = useRef<NodeJS.Timeout | number | null>(null);

  useEffect(() => {
    if (recording) {
      Animated.loop(
        Animated.sequence([
          Animated.timing(recordingAnim, { toValue: 0.4, duration: 800, useNativeDriver: true }),
          Animated.timing(recordingAnim, { toValue: 1, duration: 800, useNativeDriver: true }),
        ])
      ).start();
    } else {
      recordingAnim.setValue(1);
    }
  }, [recording]);

  useEffect(() => {
    if (playingId) {
      Animated.loop(
        Animated.sequence([
          Animated.timing(playbackAnim, { toValue: 1, duration: 500, easing: Easing.linear, useNativeDriver: true }),
          Animated.timing(playbackAnim, { toValue: 0.5, duration: 500, easing: Easing.linear, useNativeDriver: true })
        ])
      ).start();
    } else {
      playbackAnim.setValue(1);
    }
  }, [playingId]);

  useEffect(() => {
    return () => {
      if(sound) sound.unloadAsync();
      if(timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  const startRecording = async () => {
    try {
      const perm = await Audio.requestPermissionsAsync();
      if(perm.status !== 'granted') return;
      await Audio.setAudioModeAsync({ allowsRecordingIOS: true, playsInSilentModeIOS: true });
      const { recording } = await Audio.Recording.createAsync(Audio.RecordingOptionsPresets.HIGH_QUALITY);
      setRecording(recording);
      setTimer(0);
      timerRef.current = setInterval(() => setTimer(t => t + 1), 1000);
    } catch(e) { console.error(e); }
  };

  const stopRecording = async () => {
    if(!recording) return;
    if(timerRef.current) clearInterval(timerRef.current);
    await recording.stopAndUnloadAsync();
    const uri = recording.getURI();
    setRecording(null);
    if (uri) {
      setTempUri(uri);
      setSaveName(`Recording ${voiceNotes.length + 1}`);
      setSaveLocked(false);
      setSavePin('');
      setSaveModalVisible(true);
    }
  };

  const cancelSave = () => {
    setSaveModalVisible(false);
    setTimer(0);
  };

  const finalizeSave = () => {
    if (saveLocked && (savePin.length !== 4 || isNaN(Number(savePin)))) {
      Alert.alert('Invalid PIN', 'Please enter 4 digits.');
      return;
    }
    if(tempUri) {
      const note: VoiceNote = {
        id: Date.now().toString(),
        uri: tempUri,
        name: saveName || `Recording ${Date.now()}`,
        createdAt: new Date().toISOString(),
        durationSeconds: timer,
        isLocked: saveLocked,
        password: saveLocked ? savePin : undefined
      };
      setVoiceNotes([note, ...voiceNotes]);
    }
    setSaveModalVisible(false);
    setTimer(0);
  };

  const handlePlayPress = (item: VoiceNote) => {
    if(item.isLocked) {
      setNoteToPlay(item);
      setUnlockPin('');
      setUnlockVisible(true);
    } else {
      playAudio(item);
    }
  };

  const verifyUnlock = () => {
    if(noteToPlay && unlockPin === noteToPlay.password) {
      setUnlockVisible(false);
      playAudio(noteToPlay);
      setNoteToPlay(null);
    } else {
      Alert.alert('Error', 'Incorrect PIN');
    }
  };

  const playAudio = async (item: VoiceNote) => {
    if(playingId === item.id && sound) {
        await sound.stopAsync();
        setPlayingId(null);
        return;
    }
    if(sound) {
      await sound.unloadAsync();
      setSound(null);
      setPlayingId(null);
    }
    try {
       const { sound: newSound } = await Audio.Sound.createAsync({ uri: item.uri }, { isLooping });
       setSound(newSound);
       setPlayingId(item.id);
       await newSound.playAsync();
       newSound.setOnPlaybackStatusUpdate(status => {
         if(status.isLoaded && status.didJustFinish && !status.isLooping) setPlayingId(null);
       });
    } catch(e) { Alert.alert('Error', 'File not found'); }
  };

  const toggleLoop = async () => {
    const newVal = !isLooping;
    setIsLooping(newVal);
    if(sound) await sound.setIsLoopingAsync(newVal);
  };

  const shareVoice = async (uri: string) => {
    if (await Sharing.isAvailableAsync()) {
      await Sharing.shareAsync(uri);
    }
  };

  const deleteVoice = (id: string) => {
    setVoiceNotes(voiceNotes.filter(v => v.id !== id));
  };

  const openRename = (item: VoiceNote) => {
    setRenameId(item.id);
    setNewName(item.name);
    setRenameVisible(true);
  };

  const saveRename = () => {
    if(renameId) {
        setVoiceNotes(voiceNotes.map(v => v.id === renameId ? {...v, name: newName} : v));
        setRenameVisible(false);
        setRenameId(null);
    }
  };

  return (
    <View style={styles.flex1}>
      <View style={styles.recorderArea}>
        <View style={styles.timerBox}>
           <Text style={styles.timerText}>{formatTime(timer)}</Text>
           {recording && <Animated.View style={[styles.redDot, { opacity: recordingAnim }]} />}
        </View>
        <TouchableOpacity style={[styles.recordBtn, recording && styles.recordBtnActive]} onPress={recording ? stopRecording : startRecording}>
           <Ionicons name={recording ? "stop" : "mic"} size={32} color="#FFF" />
        </TouchableOpacity>
        <Text style={styles.recordLabel}>{recording ? 'Recording...' : 'Tap to Record'}</Text>
      </View>

      <FlatList
        data={voiceNotes}
        keyExtractor={item => item.id}
        contentContainerStyle={{ padding: 16 }}
        renderItem={({ item }) => (
          <SwipeableItem 
            onSwipeRight={() => deleteVoice(item.id)} 
            onSwipeLeft={() => openRename(item)}
          >
            <View style={styles.playerCard}>
               <View style={styles.playerHeader}>
                  <View style={styles.playerIconBox}>
                     <Ionicons name="musical-notes" size={20} color="#fff" />
                  </View>
                  <View style={{flex:1}}>
                     <Text style={styles.playerTitle} numberOfLines={1}>{item.name}</Text>
                     <Text style={styles.playerSub}>{formatTime(item.durationSeconds)} • {new Date(item.createdAt).toLocaleDateString()}</Text>
                  </View>
                  {item.isLocked && <Ionicons name="lock-closed" size={16} color={theme.colors.danger} />}
               </View>

               <View style={styles.visualizerContainer}>
                  {[...Array(20)].map((_, i) => (
                     <Animated.View 
                       key={i} 
                       style={[
                         styles.visualizerBar, 
                         { 
                           height: playingId === item.id ? (i % 2 === 0 ? 12 : 20) : 4,
                           opacity: playingId === item.id ? playbackAnim : 0.3,
                           backgroundColor: playingId === item.id ? theme.colors.primary : '#ccc'
                         }
                       ]} 
                     />
                  ))}
               </View>

               <View style={styles.playerControls}>
                  <TouchableOpacity onPress={() => shareVoice(item.uri)} style={styles.ctrlBtn}>
                     <Ionicons name="share-social-outline" size={20} color="#666" />
                  </TouchableOpacity>
                  <TouchableOpacity onPress={toggleLoop} style={styles.ctrlBtn}>
                     <MaterialCommunityIcons name="repeat" size={20} color={isLooping && playingId === item.id ? theme.colors.primary : "#ccc"} />
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => handlePlayPress(item)} style={styles.bigPlayBtn}>
                     <Ionicons name={playingId === item.id ? "pause" : "play"} size={28} color="#fff" />
                  </TouchableOpacity>
                  <View style={{width: 36}} /> 
               </View>
            </View>
          </SwipeableItem>
        )}
      />

      {/* SAVE MODAL */}
      <Modal visible={saveModalVisible} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.miniModal}>
            <Text style={styles.miniTitle}>Save Recording</Text>
            <TextInput style={styles.miniInput} value={saveName} onChangeText={setSaveName} placeholder="Recording Name" />
            <View style={[styles.lockToggleRow, { borderBottomWidth:0 }]}>
               <Text style={styles.lockLabel}>Lock Recording?</Text>
               <Switch value={saveLocked} onValueChange={setSaveLocked} trackColor={{true: theme.colors.primary}} />
            </View>
            {saveLocked && <TextInput style={[styles.miniInput, {textAlign:'center', letterSpacing:4, fontWeight:'bold'}]} placeholder="PIN (4 digits)" value={savePin} onChangeText={t => { if(t.length <= 4) setSavePin(t.replace(/[^0-9]/g, '')) }} keyboardType="numeric" secureTextEntry />}
            <View style={styles.modalBtnRow}>
                <TouchableOpacity onPress={cancelSave} style={styles.cancelBtn}><Text style={{color: '#666'}}>Discard</Text></TouchableOpacity>
                <TouchableOpacity onPress={finalizeSave} style={styles.saveBtn}><Text style={{color: '#FFF', fontWeight:'bold'}}>Save</Text></TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* UNLOCK MODAL */}
      <Modal visible={unlockVisible} transparent animationType="fade">
        <View style={styles.modalOverlay}>
           <View style={styles.miniModal}>
              <Text style={styles.miniTitle}>Locked Voice Note</Text>
              <TextInput style={[styles.pinInput, { backgroundColor: '#fff', borderWidth:1, borderColor:'#ddd' }]} placeholder="Enter PIN" value={unlockPin} onChangeText={t => { if(t.length <= 4) setUnlockPin(t.replace(/[^0-9]/g, '')) }} keyboardType="numeric" secureTextEntry autoFocus />
              <View style={styles.modalBtnRow}>
                <TouchableOpacity onPress={() => setUnlockVisible(false)} style={styles.cancelBtn}><Text style={{color: '#666'}}>Cancel</Text></TouchableOpacity>
                <TouchableOpacity onPress={verifyUnlock} style={styles.saveBtn}><Text style={{color: '#FFF', fontWeight:'bold'}}>Play</Text></TouchableOpacity>
              </View>
           </View>
        </View>
      </Modal>

      {/* RENAME MODAL */}
      <Modal visible={renameVisible} transparent animationType="fade">
        <View style={styles.modalOverlay}>
           <View style={styles.miniModal}>
              <Text style={styles.miniTitle}>Rename Recording</Text>
              <TextInput style={styles.miniInput} value={newName} onChangeText={setNewName} />
              <View style={styles.modalBtnRow}>
                <TouchableOpacity onPress={() => setRenameVisible(false)} style={styles.cancelBtn}><Text style={{color: '#666'}}>Cancel</Text></TouchableOpacity>
                <TouchableOpacity onPress={saveRename} style={styles.saveBtn}><Text style={{color: '#FFF', fontWeight:'bold'}}>Rename</Text></TouchableOpacity>
              </View>
           </View>
        </View>
      </Modal>
    </View>
  );
};

// ==========================================
// 7. SWIPEABLE ITEM COMPONENT (BUG FIXED)
// ==========================================

const SwipeableItem = ({ children, onSwipeRight, onSwipeLeft, onPress }: { children: React.ReactNode, onSwipeRight: () => void, onSwipeLeft: () => void, onPress?: () => void }) => {
  const pan = useRef(new Animated.ValueXY()).current;
  
  // Create refs to hold the latest version of the callback functions
  const onSwipeRightRef = useRef(onSwipeRight);
  const onSwipeLeftRef = useRef(onSwipeLeft);

  // Update refs when props change (this fixes the stale closure bug)
  useEffect(() => {
    onSwipeRightRef.current = onSwipeRight;
    onSwipeLeftRef.current = onSwipeLeft;
  }, [onSwipeRight, onSwipeLeft]);

  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (evt, gestureState) => {
        // Only capture horizontal movements bigger than vertical ones
        return Math.abs(gestureState.dx) > 10 && Math.abs(gestureState.dx) > Math.abs(gestureState.dy);
      },
      onPanResponderMove: Animated.event([null, { dx: pan.x }], { useNativeDriver: false }),
      onPanResponderRelease: (evt, gestureState) => {
        if (gestureState.dx > 100) {
          // Right Swipe (Delete)
          Animated.timing(pan, { toValue: { x: 500, y: 0 }, duration: 200, useNativeDriver: false }).start(() => {
             // Use the ref to call the latest function
             if (onSwipeRightRef.current) onSwipeRightRef.current();
             // Snap back instantly so the next item taking this place isn't offset
             pan.setValue({ x: 0, y: 0 });
          });
        } else if (gestureState.dx < -100) {
          // Left Swipe (Edit)
          Animated.timing(pan, { toValue: { x: -500, y: 0 }, duration: 200, useNativeDriver: false }).start(() => {
             if (onSwipeLeftRef.current) onSwipeLeftRef.current();
             Animated.spring(pan, { toValue: { x: 0, y: 0 }, friction: 5, useNativeDriver: false }).start();
          });
        } else {
          // Reset
          Animated.spring(pan, { toValue: { x: 0, y: 0 }, friction: 5, useNativeDriver: false }).start();
        }
      }
    })
  ).current;

  return (
    <View style={styles.swipeContainer}>
      <View style={styles.swipeBackLayer}>
         <View style={styles.swipeLeftAction}><Ionicons name="trash" size={24} color="#fff" /></View>
         <View style={styles.swipeRightAction}><MaterialIcons name="edit" size={24} color="#fff" /></View>
      </View>
      <Animated.View style={[{ transform: [{ translateX: pan.x }] }]} {...panResponder.panHandlers}>
        <TouchableOpacity activeOpacity={0.9} onPress={onPress}>
           {children}
        </TouchableOpacity>
      </Animated.View>
    </View>
  );
};

// ==========================================
// 8. SHARED COMPONENTS & STYLES
// ==========================================

const TabButton = ({ title, icon, active, onPress }: any) => (
  <TouchableOpacity onPress={onPress} style={[styles.tabBtn, active && styles.tabBtnActive]}>
    <Ionicons name={icon} size={20} color={active ? theme.colors.primary : '#888'} />
    <Text style={[styles.tabText, active && styles.tabTextActive]}>{title}</Text>
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
  swipeContainer: { marginBottom: 12, marginHorizontal: 16, position: 'relative' },
  swipeBackLayer: { position: 'absolute', top: 1, bottom: 1, left: 2, right: 2, borderRadius: 12, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  swipeLeftAction: { backgroundColor: '#EF4444', position: 'absolute', left: 0, top: 0, bottom: 0, width: '50%', borderTopLeftRadius: 12, borderBottomLeftRadius: 12, justifyContent: 'center', paddingLeft: 20 },
  swipeRightAction: { backgroundColor: '#3B82F6', position: 'absolute', right: 0, top: 0, bottom: 0, width: '50%', borderTopRightRadius: 12, borderBottomRightRadius: 12, justifyContent: 'center', alignItems: 'flex-end', paddingRight: 20 },
  noteCard: { backgroundColor: '#fff', borderRadius: 12, padding: 16, borderWidth: 1, borderColor: '#F3F4F6', shadowColor: '#000', shadowOpacity: 0.02, shadowRadius: 6, elevation: 1 },
  noteCardHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 },
  noteCardTitle: { fontSize: 17, fontWeight: '700', color: '#1F2937', flex: 1 },
  noteCardPreview: { fontSize: 14, color: '#6B7280', lineHeight: 20, height: 40 },
  noteCardFooter: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: '#F9FAFB' },
  noteDate: { fontSize: 12, color: '#9CA3AF' },
  linkCard: { backgroundColor: '#fff', borderRadius: 12, padding: 16, borderWidth: 1, borderColor: '#E5E7EB' },
  linkHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  iconCircle: { width: 32, height: 32, borderRadius: 16, backgroundColor: '#EFF6FF', alignItems: 'center', justifyContent: 'center' },
  linkTitle: { fontSize: 16, fontWeight: '700', color: '#1F2937' },
  linkDesc: { fontSize: 13, color: '#6B7280', marginTop: 2 },
  visitBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: theme.colors.primary, paddingVertical: 8, borderRadius: 8, marginTop: 10 },
  visitBtnText: { color: '#fff', fontWeight: '600', marginRight: 6, fontSize: 13 },
  playerCard: { backgroundColor: '#fff', borderRadius: 12, padding: 16, marginBottom: 12, borderWidth: 1, borderColor: '#E5E7EB', shadowColor:'#000', shadowOpacity:0.03, shadowRadius:5 },
  playerHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 16 },
  playerIconBox: { width: 44, height: 44, borderRadius: 22, backgroundColor: theme.colors.primary, alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  playerTitle: { fontSize: 16, fontWeight: '700', color: '#333' },
  playerSub: { fontSize: 12, color: '#888', marginTop: 2 },
  visualizerContainer: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', height: 40, marginBottom: 16, gap: 4 },
  visualizerBar: { width: 4, borderRadius: 2 },
  playerControls: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20 },
  ctrlBtn: { padding: 8 },
  bigPlayBtn: { width: 56, height: 56, borderRadius: 28, backgroundColor: theme.colors.primary, alignItems: 'center', justifyContent: 'center', shadowColor: theme.colors.primary, shadowOpacity: 0.4, shadowRadius: 8 },
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
  recorderArea: { alignItems: 'center', padding: 24, backgroundColor: '#fff', borderRadius: 20, marginBottom: 20, marginHorizontal: 16, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 10, elevation: 2 },
  timerBox: { flexDirection: 'row', alignItems: 'center', marginBottom: 16 },
  timerText: { fontSize: 32, fontWeight: '200', color: '#333', fontVariant: ['tabular-nums'] },
  redDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: theme.colors.danger, marginLeft: 8 },
  recordBtn: { width: 72, height: 72, borderRadius: 36, backgroundColor: theme.colors.primary, alignItems: 'center', justifyContent: 'center', shadowColor: theme.colors.primary, shadowOpacity: 0.4, shadowRadius: 8, elevation: 4 },
  recordBtnActive: { backgroundColor: theme.colors.danger, transform: [{scale: 1.1}] },
  recordLabel: { marginTop: 12, color: '#6B7280', fontSize: 13, fontWeight: '500' },
});