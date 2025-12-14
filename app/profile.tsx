import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { useRouter } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import React, { useState } from 'react';
import {
  Alert,
  Image,
  Modal,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useAppData } from '../src/context/AppDataContext';
import { theme } from '../src/theme/theme';

// Reuse your existing components or keep simple
// You can import AboutView/ContactView here if you want to show them in a "Credits" modal

export default function ProfileScreen() {
  const { data, updateProfile } = useAppData();
  const { profile } = data;
  const router = useRouter();

  const [editModalVisible, setEditModalVisible] = useState(false);
  const [tempName, setTempName] = useState(profile.name);
  const [tempRole, setTempRole] = useState(profile.role);

  // Toggles (Placeholders for future logic)
  const [notificationsEnabled, setNotificationsEnabled] = useState(true);
  const [darkMode, setDarkMode] = useState(false);

  // --- ACTIONS ---
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
      Alert.alert('Error', 'Could not pick image');
    }
  };

  const saveProfile = () => {
    updateProfile({ ...profile, name: tempName, role: tempRole });
    setEditModalVisible(false);
  };

  const openDeveloperSite = () => {
    // This is where you link to your personal site/portfolio
    WebBrowser.openBrowserAsync('https://github.com/dhiraj7kr');
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={{ paddingBottom: 40 }} showsVerticalScrollIndicator={false}>
        
        {/* 1. HEADER & IDENTITY */}
        <View style={styles.header}>
          <Text style={styles.screenTitle}>My Profile</Text>
          <TouchableOpacity onPress={() => Alert.alert('Settings', 'More settings coming soon!')}>
             {/* You might route to a deeper settings page, or keep it all here */}
             <Ionicons name="ellipsis-horizontal-circle-outline" size={28} color={theme.colors.text} />
          </TouchableOpacity>
        </View>

        <View style={styles.profileCard}>
           <TouchableOpacity onPress={pickImage} style={styles.avatarContainer}>
              {profile.avatarUri ? (
                <Image source={{ uri: profile.avatarUri }} style={styles.avatar} />
              ) : (
                <View style={styles.avatarPlaceholder}>
                  <Text style={styles.avatarInitials}>{profile.name?.[0] || 'U'}</Text>
                </View>
              )}
              <View style={styles.cameraBadge}>
                <Ionicons name="camera" size={14} color="#fff" />
              </View>
           </TouchableOpacity>
           
           <View style={{alignItems:'center', marginTop: 12}}>
             <Text style={styles.userName}>{profile.name || 'User Name'}</Text>
             <Text style={styles.userRole}>{profile.role || 'Productivity Enthusiast'}</Text>
           </View>

           <TouchableOpacity style={styles.editBtn} onPress={() => { setTempName(profile.name); setTempRole(profile.role); setEditModalVisible(true); }}>
              <Text style={styles.editBtnText}>Edit Profile</Text>
           </TouchableOpacity>
        </View>

        {/* 2. GAMIFICATION / STATS */}
        <View style={styles.statsRow}>
           <StatItem label="Tasks Done" value="124" icon="checkbox-outline" color="#10B981" />
           <StatItem label="Streak" value="12" icon="flame" color="#F59E0B" />
           <StatItem label="Focus Hrs" value="48" icon="time-outline" color="#3B82F6" />
        </View>

        {/* 3. APP SETTINGS */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Preferences</Text>
          
          <SettingRow 
            icon="notifications-outline" 
            label="Notifications" 
            color="#6366F1"
            rightElement={<Switch value={notificationsEnabled} onValueChange={setNotificationsEnabled} trackColor={{true: theme.colors.primary}} />}
          />
          <SettingRow 
            icon="moon-outline" 
            label="Dark Mode" 
            color="#334155"
            rightElement={<Switch value={darkMode} onValueChange={setDarkMode} trackColor={{true: theme.colors.primary}} />}
          />
        </View>

        {/* 4. DATA MANAGEMENT */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Data & Storage</Text>
          <SettingRow 
            icon="cloud-upload-outline" 
            label="Backup Data" 
            color="#0EA5E9"
            onPress={() => Alert.alert('Backup', 'Feature coming soon!')}
          />
          <SettingRow 
            icon="cloud-download-outline" 
            label="Restore Data" 
            color="#0EA5E9"
            onPress={() => Alert.alert('Restore', 'Feature coming soon!')}
          />
          <SettingRow 
            icon="trash-outline" 
            label="Clear All Data" 
            color="#EF4444"
            isDestructive
            onPress={() => Alert.alert('Reset', 'Are you sure?', [{text:'Cancel'}, {text:'Delete', style:'destructive'}])}
          />
        </View>

        {/* 5. ABOUT & CREDITS (Where your portfolio lives now) */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>About Duper</Text>
          <SettingRow 
            icon="star-outline" 
            label="Rate Us" 
            color="#F59E0B"
            onPress={() => Alert.alert('Thanks!', 'We appreciate the love.')}
          />
          <SettingRow 
            icon="code-slash-outline" 
            label="Developer Info" 
            subLabel="Built by Dhiraj"
            color="#111827"
            onPress={openDeveloperSite}
          />
          <View style={{alignItems:'center', marginTop: 20}}>
            <Text style={{color: '#94A3B8', fontSize: 12}}>Version 1.0.0 (Build 2025.1)</Text>
          </View>
        </View>

      </ScrollView>

      {/* EDIT PROFILE MODAL */}
      <Modal visible={editModalVisible} animationType="slide" transparent>
         <View style={styles.modalOverlay}>
            <View style={styles.modalContent}>
               <Text style={styles.modalTitle}>Update Profile</Text>
               <Text style={styles.inputLabel}>Display Name</Text>
               <TextInput style={styles.input} value={tempName} onChangeText={setTempName} />
               
               <Text style={styles.inputLabel}>Tagline / Role</Text>
               <TextInput style={styles.input} value={tempRole} onChangeText={setTempRole} />

               <View style={styles.modalActions}>
                  <TouchableOpacity onPress={() => setEditModalVisible(false)} style={styles.cancelBtn}>
                     <Text style={{color: '#666', fontWeight:'600'}}>Cancel</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={saveProfile} style={styles.saveBtn}>
                     <Text style={{color: '#FFF', fontWeight:'600'}}>Save Changes</Text>
                  </TouchableOpacity>
               </View>
            </View>
         </View>
      </Modal>
    </SafeAreaView>
  );
}

// --- SUB-COMPONENTS ---

const StatItem = ({ label, value, icon, color }: any) => (
  <View style={styles.statCard}>
     <View style={[styles.statIconCircle, { backgroundColor: color + '20' }]}>
        <Ionicons name={icon} size={20} color={color} />
     </View>
     <Text style={styles.statValue}>{value}</Text>
     <Text style={styles.statLabel}>{label}</Text>
  </View>
);

const SettingRow = ({ icon, label, subLabel, color, rightElement, onPress, isDestructive }: any) => (
  <TouchableOpacity 
    style={styles.settingRow} 
    onPress={onPress} 
    disabled={!onPress && !rightElement}
    activeOpacity={onPress ? 0.7 : 1}
  >
    <View style={[styles.settingIcon, { backgroundColor: color + '15' }]}>
       <Ionicons name={icon} size={20} color={isDestructive ? '#EF4444' : color} />
    </View>
    <View style={{flex: 1, marginLeft: 12}}>
       <Text style={[styles.settingLabel, isDestructive && { color: '#EF4444' }]}>{label}</Text>
       {subLabel && <Text style={styles.settingSubLabel}>{subLabel}</Text>}
    </View>
    {rightElement ? rightElement : <Ionicons name="chevron-forward" size={20} color="#CBD5E1" />}
  </TouchableOpacity>
);

// --- STYLES ---

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.background },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingTop: 10, paddingBottom: 10 },
  screenTitle: { fontSize: 28, fontWeight: '800', color: theme.colors.text },
  
  profileCard: { alignItems: 'center', marginTop: 10, marginBottom: 20 },
  avatarContainer: { position: 'relative' },
  avatar: { width: 100, height: 100, borderRadius: 50 },
  avatarPlaceholder: { width: 100, height: 100, borderRadius: 50, backgroundColor: '#E2E8F0', alignItems: 'center', justifyContent: 'center' },
  avatarInitials: { fontSize: 36, fontWeight: '700', color: '#64748B' },
  cameraBadge: { position: 'absolute', bottom: 0, right: 0, backgroundColor: theme.colors.primary, padding: 8, borderRadius: 20, borderWidth: 3, borderColor: '#fff' },
  userName: { fontSize: 22, fontWeight: '700', color: theme.colors.text, marginTop: 4 },
  userRole: { fontSize: 14, color: '#64748B' },
  editBtn: { marginTop: 12, paddingVertical: 8, paddingHorizontal: 20, backgroundColor: '#F1F5F9', borderRadius: 20 },
  editBtnText: { color: theme.colors.text, fontWeight: '600', fontSize: 13 },

  statsRow: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 20, marginBottom: 30 },
  statCard: { flex: 1, backgroundColor: '#fff', borderRadius: 16, padding: 16, alignItems: 'center', marginHorizontal: 4, shadowColor: '#000', shadowOpacity: 0.03, shadowRadius: 6, shadowOffset: {width:0,height:2}, elevation:1 },
  statIconCircle: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', marginBottom: 8 },
  statValue: { fontSize: 18, fontWeight: '800', color: theme.colors.text },
  statLabel: { fontSize: 11, color: '#64748B', fontWeight: '600' },

  section: { paddingHorizontal: 20, marginBottom: 24 },
  sectionTitle: { fontSize: 13, fontWeight: '700', color: '#94A3B8', marginBottom: 12, textTransform: 'uppercase', letterSpacing: 0.5 },
  settingRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', padding: 12, borderRadius: 12, marginBottom: 8, borderWidth:1, borderColor: '#F1F5F9' },
  settingIcon: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  settingLabel: { fontSize: 15, fontWeight: '600', color: theme.colors.text },
  settingSubLabel: { fontSize: 12, color: '#64748B', marginTop: 2 },

  // Modal
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: 24 },
  modalContent: { backgroundColor: '#fff', borderRadius: 20, padding: 24 },
  modalTitle: { fontSize: 20, fontWeight: '700', marginBottom: 20, textAlign: 'center' },
  inputLabel: { fontSize: 12, fontWeight: '700', color: '#64748B', marginBottom: 6, marginLeft: 4 },
  input: { backgroundColor: '#F8FAFC', padding: 14, borderRadius: 12, borderWidth: 1, borderColor: '#E2E8F0', marginBottom: 16 },
  modalActions: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 10 },
  cancelBtn: { flex: 1, padding: 14, alignItems: 'center', backgroundColor: '#F1F5F9', borderRadius: 12, marginRight: 10 },
  saveBtn: { flex: 1, padding: 14, alignItems: 'center', backgroundColor: theme.colors.primary, borderRadius: 12 },
});