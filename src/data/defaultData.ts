export type SocialLinks = {
  github: string;
  linkedin: string;
  website?: string;
};

export type Profile = {
  name: string;
  role: string;
  tagline: string;
  avatarUri?: string; // local image path
  social: SocialLinks;
  location: string;
  phone: string;
  email: string;
};

export type Project = {
  id: string;
  title: string;
  shortDescription: string;
  problem: string;
  solution: string;
  techStack: string[];
  features: string[];
  githubUrl?: string;
  liveUrl?: string;
  screenshotUri?: string; // local image path
};

export type SkillCategory = {
  id: string;
  name: string;
  skills: string[];
};

export type EducationItem = {
  id: string;
  title: string;
  institution: string;
  period: string;
  score?: string;
};

export type ExperienceItem = {
  id: string;
  role: string;
  company: string;
  period: string;
  location: string;
  details: string[];
};

export type ContactSettings = {
  email: string;
  phone: string;
};

export type AppData = {
  profile: Profile;
  projects: Project[];
  skills: SkillCategory[];
  education: EducationItem[];
  experience: ExperienceItem[];
  contact: ContactSettings;
};

export const defaultData: AppData = {
  profile: {
    name: 'Dhiraj Kumar',
    role: 'Software Engineer',
    tagline:
      'Software Engineer specializing in AI-powered systems, full-stack development, and automation.',
    location: 'Hyderabad, India',
    phone: '+91-9472826071',
    email: 'dhiraj7kr@gmail.com',
    social: {
      // 🔁 Update these to your exact URLs if different
      github: 'https://github.com/dhiraj7kr',
      linkedin: 'https://www.linkedin.com/in/dhiraj7kr',
      website: ''
    }
  },

  projects: [
    {
      id: 'inventory',
      title: 'Inventory Management System',
      shortDescription:
        'End-to-end inventory management built using Java Spring Boot and MERN for scalable stock operations.',
      problem:
        'Businesses need a reliable way to manage stock across products, orders, and warehouses with minimal manual effort.',
      solution:
        'Designed and implemented RESTful inventory APIs using Java Spring Boot, and a MERN-based dashboard for real-time stock tracking and analytics.',
      techStack: ['Java', 'Spring Boot', 'React', 'MongoDB', 'Node.js'],
      features: [
        'Product, stock, and order management APIs',
        'MERN-based interactive dashboard for live stock tracking',
        'Automated restock alerts and low-inventory triggers',
        'Batch-update workflows and analytics reports',
        'Role-based access and seamless CRUD operations'
      ],
      githubUrl: '',
      liveUrl: '',
      screenshotUri: undefined
    },
    {
      id: 'm2',
      title: 'M2 — My Memory: Personal Knowledge & Task Memory System',
      shortDescription:
        'AI-powered memory system that organizes tasks, meetings, chats, PDFs, and voice notes with semantic search.',
      problem:
        'Professionals struggle to find and act on scattered information from multiple tools like chats, meetings, and documents.',
      solution:
        'Built a central memory system with embeddings-based semantic search, AI summaries, and task generation, with a Streamlit UI.',
      techStack: ['Python', 'LangChain', 'FAISS', 'Streamlit', 'OpenAI APIs'],
      features: [
        'Centralized storage of tasks, meetings, chats, PDFs and voice notes',
        'Semantic search using embeddings + FAISS',
        'AI summaries and automatic task generation',
        'Export to PDF and voice formats',
        'Multi-user task CRUD support via Streamlit UI'
      ],
      githubUrl: '',
      liveUrl: '',
      screenshotUri: undefined
    },
    {
      id: 'cruise-mern',
      title: 'Cruise Management System (MERN)',
      shortDescription:
        'Full-stack cruise management platform with trip listings, bookings and admin dashboards.',
      problem:
        'Cruise companies need an online system to manage itineraries, bookings, and admin insights efficiently.',
      solution:
        'Developed MERN-based web app with booking flows, admin dashboards and performance-optimized responsive UI.',
      techStack: ['React', 'Node.js', 'Express', 'MongoDB'],
      features: [
        'Trip listing and booking workflows',
        'Admin dashboards for monitoring bookings',
        'Responsive UI with improved performance',
        'Reusable, optimized React components'
      ],
      githubUrl: '',
      liveUrl: '',
      screenshotUri: undefined
    },
    {
      id: 'dhirajx',
      title: 'DhirajX — React Native Portfolio',
      shortDescription:
        'Mobile portfolio app built with Expo, local JSON storage, and editable content.',
      problem:
        'Developers need a portable and offline-friendly portfolio app to showcase skills and projects.',
      solution:
        'Designed a lightweight tab-based React Native app with local persistence, project details, and gallery-based images.',
      techStack: ['React Native', 'Expo', 'TypeScript', 'AsyncStorage'],
      features: [
        'Bottom tab navigation with clean sections',
        'Project list and detail views',
        'Local JSON persistence with AsyncStorage',
        'Profile and project images from gallery'
      ],
      githubUrl: '',
      liveUrl: '',
      screenshotUri: undefined
    }
  ],

  skills: [
    {
      id: 'languages',
      name: 'Languages',
      skills: ['JavaScript', 'Java', 'Python', 'HTML', 'CSS', '.NET', 'C#']
    },
    {
      id: 'frameworks',
      name: 'Frameworks',
      skills: ['Spring Boot', 'MERN', 'Django', 'LangChain', 'Streamlit']
    },
    {
      id: 'cloud-db',
      name: 'Cloud & Databases',
      skills: ['MongoDB', 'SQL', 'OpenAI APIs', 'FAISS']
    },
    {
      id: 'tools',
      name: 'Developer Tools',
      skills: ['Git', 'PowerApps', 'Power Automate', 'Microsoft Copilot Studio']
    },
    {
      id: 'soft',
      name: 'Soft Skills',
      skills: [
        'Communication',
        'Critical Thinking',
        'Team Collaboration',
        'Agile Development'
      ]
    },
    {
      id: 'interests',
      name: 'Areas of Interest',
      skills: ['Generative AI', 'Full-stack Development', 'Automation']
    }
  ],

  education: [
    {
      id: 'jain',
      title: 'B.Tech in Computer Science and Engineering',
      institution: 'Jain (Deemed-to-be University), Bengaluru',
      period: '2020 – 2024',
      score: 'CGPA: 8.2'
    }
  ],

  experience: [
    {
      id: 'acuvate',
      role: 'Software Developer',
      company: 'ACUVATE Software Pvt. Ltd.',
      period: 'Aug 2024 – Present',
      location: 'Hyderabad, India',
      details: [
        'Developed ANNA, an AI-powered travel assistant chatbot for Holland America Line (HAL).',
        'Built live-agent connector using .NET and C# enabling real-time customer → agent communication.',
        'Integrated cruise lookup, itinerary search, booking APIs, and automated response generation.'
      ]
    },
    {
      id: 'bharat-intern',
      role: 'Web Developer Intern',
      company: 'Bharat Intern',
      period: 'Oct 2023 – Nov 2023',
      location: 'Remote',
      details: [
        'Developed a full-stack Cruise Management System using MERN.',
        'Implemented trip listings, booking flows, and admin dashboards.',
        'Improved responsive UI and optimized component performance.'
      ]
    }
  ],

  contact: {
    email: 'dhiraj7kr@gmail.com',
    phone: '+91-9472826071'
  }
};
