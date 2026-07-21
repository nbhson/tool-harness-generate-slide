const { SlideExporter } = require('./src/harness/tools/slideExporter');

async function test() {
  const slides = [
    {
      id: '1', index: 0,
      content: {
        title: 'Project Timeline',
        subtitle: 'Key Milestones',
        bullets: [],
        layout: 'timeline',
        timeline: [
          { date: 'Q1 2024', title: 'Kickoff', description: 'Initial planning', icon: 'calendar' },
          { date: 'Q2 2024', title: 'Development', description: 'Core features', icon: 'code' },
        ],
      },
      isValid: true, validationErrors: [],
    },
    {
      id: '2', index: 1,
      content: {
        title: 'Performance Metrics',
        subtitle: '2024 Results',
        bullets: [],
        layout: 'stats',
        stats: [
          { value: '45%', label: 'Revenue Growth', icon: 'up', color: '#22c55e' },
          { value: '120%', label: 'User Growth', icon: 'users', color: '#3b82f6' },
        ],
      },
      isValid: true, validationErrors: [],
    },
    {
      id: '3', index: 2,
      content: {
        title: 'FAQ',
        subtitle: 'Common Questions',
        bullets: [],
        layout: 'faq',
        faq: [
          { question: 'What is this?', answer: 'A comprehensive solution' },
          { question: 'How does it work?', answer: 'Uses AI and automation' },
        ],
      },
      isValid: true, validationErrors: [],
    },
  ];

  const presentation = {
    id: 'test', title: 'New Layouts Demo', slides,
    isValid: true, validationErrors: [],
    theme: {
      name: 'modern',
      colors: { primary: '#2563eb', secondary: '#7c3aed', accent: '#10b981', background: '#ffffff', text: '#1f2937', textLight: '#6b7280' },
      fonts: { title: 'Inter', body: 'Inter', accent: 'Inter' },
      layout: { width: 1920, height: 1080, padding: { top: 40, left: 40, right: 40, bottom: 40 } },
    },
    metadata: { author: 'Test', topic: 'Demo', aspectRatio: '16:9', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), language: 'en', totalSlides: 3 },
  };

  const exporter = new SlideExporter();
  await exporter.exportPPTX(presentation, './output/new-layouts-demo.pptx');
  console.log('✅ PPTX exported to ./output/new-layouts-demo.pptx');
  console.log('📊 Contains: timeline, stats, faq layouts');
}
test().catch(console.error);
