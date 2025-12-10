import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import SectionHeader from '../src/components/SectionHeader';
import SkillTag from '../src/components/SkillTag';
import { useAppData } from '../src/context/AppDataContext';
import { theme } from '../src/theme/theme';

const AboutScreen: React.FC = () => {
  const { data } = useAppData();
  const { profile, skills, education, experience } = data;

  return (
    <ScrollView style={styles.container}>
      <SectionHeader title="About" />
      <Text style={styles.text}>
        I&apos;m {profile.name}, a {profile.role} based in {profile.location}. I
        enjoy building AI-powered systems, scalable backends, and polished
        frontends. My work spans chatbot development, full-stack web apps, and
        productivity tools that automate real business workflows.
      </Text>

      <SectionHeader title="Technical Skills" subtitle="Grouped by category" />
      {skills.map((cat) => (
        <View key={cat.id} style={styles.skillCategory}>
          <Text style={styles.skillCategoryTitle}>{cat.name}</Text>
          <View style={styles.skillRow}>
            {cat.skills.map((s) => (
              <SkillTag key={s} label={s} style={styles.skillTag} />
            ))}
          </View>
        </View>
      ))}

      <SectionHeader title="Experience" />
      {experience.map((ex) => (
        <View key={ex.id} style={styles.timelineItem}>
          <View style={styles.timelineDot} />
          <View style={styles.timelineContent}>
            <Text style={styles.timelineTitle}>
              {ex.role} · {ex.company}
            </Text>
            <Text style={styles.timelineSubtitle}>
              {ex.location} · {ex.period}
            </Text>
            {ex.details.map((d, idx) => (
              <Text key={idx} style={styles.text}>
                • {d}
              </Text>
            ))}
          </View>
        </View>
      ))}

      <SectionHeader title="Education" />
      {education.map((e) => (
        <View key={e.id} style={styles.timelineItem}>
          <View style={styles.timelineDot} />
          <View style={styles.timelineContent}>
            <Text style={styles.timelineTitle}>{e.title}</Text>
            <Text style={styles.timelineSubtitle}>{e.institution}</Text>
            <Text style={styles.timelinePeriod}>{e.period}</Text>
            {e.score && <Text style={styles.text}>{e.score}</Text>}
          </View>
        </View>
      ))}

      <SectionHeader title="Certifications" />
      <Text style={styles.text}>
        • C# Basics for Beginners: Learn C# Fundamentals by Coding — Udemy
      </Text>
      <Text style={styles.text}>
        • Java 8+ Essential Training: Objects and APIs — LinkedIn Learning
      </Text>
      <Text style={styles.text}>
        • Oracle Fusion Cloud Applications HCM Certified Foundations Associate —
        Oracle University
      </Text>
    </ScrollView>
  );
};

export default AboutScreen;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
    padding: theme.spacing(2)
  },
  text: {
    color: theme.colors.textSecondary,
    marginBottom: theme.spacing(1),
    fontSize: theme.fontSize.sm
  },
  skillCategory: {
    marginBottom: theme.spacing(2)
  },
  skillCategoryTitle: {
    color: theme.colors.text,
    fontSize: theme.fontSize.base,
    fontWeight: '600',
    marginBottom: 4
  },
  skillRow: {
    flexDirection: 'row',
    flexWrap: 'wrap'
  },
  skillTag: {
    marginRight: 4,
    marginBottom: 4
  },
  timelineItem: {
    flexDirection: 'row',
    marginBottom: theme.spacing(2)
  },
  timelineDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: theme.colors.accent,
    marginTop: 4,
    marginRight: theme.spacing(1)
  },
  timelineContent: {
    flex: 1
  },
  timelineTitle: {
    color: theme.colors.text,
    fontWeight: '600'
  },
  timelineSubtitle: {
    color: theme.colors.textSecondary,
    fontSize: theme.fontSize.sm
  },
  timelinePeriod: {
    color: theme.colors.textSecondary,
    fontSize: theme.fontSize.xs,
    marginBottom: 4
  }
});
