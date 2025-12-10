import React from 'react';
import {
  Image,
  StyleSheet,
  Text,
  TouchableOpacity,
  View
} from 'react-native';
import { Project } from '../data/defaultData';
import { theme } from '../theme/theme';
import SkillTag from './SkillTag';

type Props = {
  project: Project;
  onPress: () => void;
};

const ProjectCard: React.FC<Props> = ({ project, onPress }) => (
  <TouchableOpacity style={styles.card} onPress={onPress}>
    {project.screenshotUri ? (
      <Image source={{ uri: project.screenshotUri }} style={styles.image} />
    ) : null}
    <View style={styles.content}>
      <Text style={styles.title}>{project.title}</Text>
      <Text style={styles.description} numberOfLines={2}>
        {project.shortDescription}
      </Text>
      <View style={styles.tagsRow}>
        {project.techStack.slice(0, 3).map((t) => (
          <SkillTag key={t} label={t} style={styles.tag} />
        ))}
      </View>
      <Text style={styles.detailsLink}>View Details →</Text>
    </View>
  </TouchableOpacity>
);

export default ProjectCard;

const styles = StyleSheet.create({
  card: {
    backgroundColor: theme.colors.card,
    borderRadius: theme.radius.xl,
    overflow: 'hidden',
    marginBottom: theme.spacing(2),
    borderWidth: 1,
    borderColor: theme.colors.border,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 1
  },
  image: {
    width: '100%',
    height: 160
  },
  content: {
    padding: theme.spacing(2)
  },
  title: {
    color: theme.colors.text,
    fontSize: theme.fontSize.lg,
    fontWeight: '600',
    marginBottom: 4
  },
  description: {
    color: theme.colors.textSecondary,
    fontSize: theme.fontSize.sm
  },
  tagsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: theme.spacing(1)
  },
  tag: {
    marginRight: 4,
    marginBottom: 4
  },
  detailsLink: {
    marginTop: theme.spacing(1),
    color: theme.colors.primaryDark,
    fontSize: theme.fontSize.sm,
    fontWeight: '500'
  }
});
