import React, { useState } from 'react';
import {
    Alert,
    Linking,
    ScrollView,
    StyleSheet,
    Text,
    View
} from 'react-native';
import IconButton from '../src/components/IconButton';
import SectionHeader from '../src/components/SectionHeader';
import TextInputField from '../src/components/TextInputField';
import { useAppData } from '../src/context/AppDataContext';
import { theme } from '../src/theme/theme';

const ContactScreen: React.FC = () => {
  const { data } = useAppData();
  const { contact, profile } = data;

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('');

  const sendMessage = () => {
    if (!name || !email || !message) {
      Alert.alert('Missing info', 'Please fill all fields.');
      return;
    }
    const subject = encodeURIComponent(`Portfolio Contact from ${name}`);
    const body = encodeURIComponent(
      `${message}\n\nFrom: ${name} <${email}>\n\nPhone: ${contact.phone}`
    );
    const mailto = `mailto:${contact.email}?subject=${subject}&body=${body}`;
    Linking.openURL(mailto).catch(() =>
      Alert.alert('Error', 'Could not open email client.')
    );
  };

  const openLink = (url?: string) => {
    if (!url) return;
    Linking.openURL(url).catch(() => {});
  };

  return (
    <ScrollView style={styles.container}>
      <SectionHeader
        title="Contact"
        subtitle="Reach out for roles, collaborations, or freelance work."
      />

      <View style={styles.infoCard}>
        <Text style={styles.infoLabel}>Email</Text>
        <Text style={styles.infoValue}>{contact.email}</Text>
        <Text style={styles.infoLabel}>Phone</Text>
        <Text style={styles.infoValue}>{contact.phone}</Text>
        <Text style={styles.infoLabel}>Location</Text>
        <Text style={styles.infoValue}>{profile.location}</Text>
      </View>

      <Text style={styles.text}>
        Use the form below and I&apos;ll receive your message via email.
      </Text>

      <TextInputField label="Your Name" value={name} onChangeText={setName} />
      <TextInputField
        label="Your Email"
        value={email}
        onChangeText={setEmail}
        keyboardType="email-address"
      />
      <TextInputField
        label="Message"
        value={message}
        onChangeText={setMessage}
        multiline
      />

      <IconButton label="Send Message" onPress={sendMessage} />

      <SectionHeader
        title="Connect via"
        subtitle="Social profiles & direct links"
      />

      <View style={styles.linksRow}>
        <IconButton
          label="GitHub"
          onPress={() => openLink(profile.social.github)}
          style={styles.linkButton}
        />
        <IconButton
          label="LinkedIn"
          onPress={() => openLink(profile.social.linkedin)}
          style={styles.linkButton}
        />
      </View>
    </ScrollView>
  );
};

export default ContactScreen;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
    padding: theme.spacing(2)
  },
  text: {
    color: theme.colors.textSecondary,
    marginBottom: theme.spacing(2)
  },
  infoCard: {
    backgroundColor: theme.colors.card,
    borderRadius: theme.radius.lg,
    borderWidth: 1,
    borderColor: theme.colors.border,
    padding: theme.spacing(2),
    marginBottom: theme.spacing(2)
  },
  infoLabel: {
    color: theme.colors.textSecondary,
    fontSize: theme.fontSize.xs
  },
  infoValue: {
    color: theme.colors.text,
    fontSize: theme.fontSize.base,
    marginBottom: 4
  },
  linksRow: {
    flexDirection: 'row',
    marginTop: theme.spacing(1),
    marginBottom: theme.spacing(4)
  },
  linkButton: {
    marginRight: theme.spacing(1)
  }
});
