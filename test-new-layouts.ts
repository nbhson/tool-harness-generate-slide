import { SlideExporter } from './src/harness/tools/slideExporter';
import { Presentation } from './src/schemas/presentation.schema';
import { Slide, SlideLayout, FlowchartNode, FlowchartEdge } from './src/schemas/slide.schema';

// Create a test presentation with all new layouts
async function testNewLayouts() {
  console.log('🚀 Testing new layouts...');

  // Create slides with new layouts manually (without LLM)
  const slides: Slide[] = [
    // Timeline slide
    {
      id: '1',
      index: 0,
      content: {
        title: 'Project Timeline',
        subtitle: 'Key Milestones',
        bullets: [],
        layout: 'timeline',
        timeline: [
          { date: 'Q1 2024', title: 'Project Kickoff', description: 'Initial planning and team formation', icon: 'calendar' },
          { date: 'Q2 2024', title: 'Development Phase', description: 'Core features implementation', icon: 'code' },
          { date: 'Q3 2024', title: 'Testing', description: 'Quality assurance and bug fixes', icon: 'check' },
          { date: 'Q4 2024', title: 'Launch', description: 'Product release to market', icon: 'rocket' },
        ],
      },
      isValid: true,
      validationErrors: [],
    },

    // Stats slide
    {
      id: '2',
      index: 1,
      content: {
        title: 'Performance Metrics',
        subtitle: '2024 Results',
        bullets: [],
        layout: 'stats',
        stats: [
          { value: '45%', label: 'Revenue Growth', icon: 'trending-up', color: '#22c55e' },
          { value: '120%', label: 'User Growth', icon: 'users', color: '#3b82f6' },
          { value: '99.9%', label: 'Uptime', icon: 'check-circle', color: '#10b981' },
          { value: '$1.2M', label: 'Revenue', icon: 'dollar', color: '#f59e0b' },
        ],
      },
      isValid: true,
      validationErrors: [],
    },

    // FAQ slide
    {
      id: '3',
      index: 2,
      content: {
        title: 'Frequently Asked Questions',
        subtitle: 'Common Questions',
        bullets: [],
        layout: 'faq',
        faq: [
          { question: 'What is this product?', answer: 'A comprehensive solution for modern business needs' },
          { question: 'How does it work?', answer: 'Uses AI and automation to streamline workflows' },
          { question: 'Is it secure?', answer: 'Enterprise-grade security with end-to-end encryption' },
          { question: 'What is the pricing?', answer: 'Flexible plans starting from $99/month' },
        ],
      },
      isValid: true,
      validationErrors: [],
    },

    // Pricing slide
    {
      id: '4',
      index: 3,
      content: {
        title: 'Pricing Plans',
        subtitle: 'Choose Your Plan',
        bullets: [],
        layout: 'pricing',
        pricing: [
          {
            name: 'Basic',
            price: '$99',
            period: '/month',
            features: ['Up to 10 users', 'Basic support', 'Core features'],
            highlighted: false,
            buttonText: 'Get Started',
          },
          {
            name: 'Pro',
            price: '$299',
            period: '/month',
            features: ['Up to 50 users', 'Priority support', 'All features', 'API access'],
            highlighted: true,
            buttonText: 'Get Started',
          },
          {
            name: 'Enterprise',
            price: '$999',
            period: '/month',
            features: ['Unlimited users', '24/7 support', 'All features', 'Custom integration'],
            highlighted: false,
            buttonText: 'Contact Sales',
          },
        ],
      },
      isValid: true,
      validationErrors: [],
    },

    // Testimonial slide
    {
      id: '5',
      index: 4,
      content: {
        title: 'Customer Testimonials',
        subtitle: 'What Our Clients Say',
        bullets: [],
        layout: 'testimonial',
        testimonials: [
          {
            quote: 'This product transformed our business operations completely!',
            author: 'John Doe',
            title: 'CEO',
            company: 'TechCorp',
            avatar: '',
          },
          {
            quote: 'The best investment we made this year. ROI in just 3 months.',
            author: 'Jane Smith',
            title: 'CTO',
            company: 'Innovate Inc',
            avatar: '',
          },
        ],
      },
      isValid: true,
      validationErrors: [],
    },

    // Code slide
    {
      id: '6',
      index: 5,
      content: {
        title: 'Sample Code',
        subtitle: 'TypeScript Example',
        bullets: [],
        layout: 'code',
        code: {
          language: 'typescript',
          code: `interface User {
  id: string;
  name: string;
  email: string;
  createdAt: Date;
}

function greetUser(user: User): string {
  return 'Hello, ' + user.name + '!';
}`,
          title: 'user.ts',
          lineNumbers: true,
        },
      },
      isValid: true,
      validationErrors: [],
    },

    // Flowchart slide
    {
      id: '7',
      index: 6,
      content: {
        title: 'Process Flowchart',
        subtitle: 'Order Processing',
        bullets: [],
        layout: 'flowchart',
        flowchart: {
          nodes: [
            { id: 'start', label: 'Start', type: 'start' as FlowchartNode['type'] },
            { id: 'validate', label: 'Validate Order', type: 'process' as FlowchartNode['type'] },
            { id: 'payment', label: 'Process Payment', type: 'process' as FlowchartNode['type'] },
            { id: 'ship', label: 'Ship Order', type: 'process' as FlowchartNode['type'] },
            { id: 'end', label: 'Complete', type: 'end' as FlowchartNode['type'] },
          ],
          edges: [
            { from: 'start', to: 'validate', label: '' },
            { from: 'validate', to: 'payment', label: 'Valid' },
            { from: 'payment', to: 'ship', label: 'Paid' },
            { from: 'ship', to: 'end', label: '' },
          ],
          direction: 'vertical',
        },
      },
      isValid: true,
      validationErrors: [],
    },

    // Video slide
    {
      id: '8',
      index: 7,
      content: {
        title: 'Product Demo',
        subtitle: 'Watch Our Video',
        bullets: ['Learn how to use the product', 'See it in action'],
        layout: 'video',
        video: {
          url: 'https://youtube.com/watch?v=dQw4w9WgXcQ',
          type: 'youtube',
          title: 'Product Demo Video',
          poster: '',
          autoplay: false,
          controls: true,
        },
      },
      isValid: true,
      validationErrors: [],
    },

    // Image Grid slide
    {
      id: '9',
      index: 8,
      content: {
        title: 'Product Gallery',
        subtitle: 'Our Solutions',
        bullets: [],
        layout: 'image-grid',
        imageGrid: [
          { url: '', alt: 'Product Screenshot 1', position: { x: 0, y: 0, width: 100, height: 100 } },
          { url: '', alt: 'Product Screenshot 2', position: { x: 0, y: 0, width: 100, height: 100 } },
          { url: '', alt: 'Product Screenshot 3', position: { x: 0, y: 0, width: 100, height: 100 } },
          { url: '', alt: 'Product Screenshot 4', position: { x: 0, y: 0, width: 100, height: 100 } },
          { url: '', alt: 'Product Screenshot 5', position: { x: 0, y: 0, width: 100, height: 100 } },
          { url: '', alt: 'Product Screenshot 6', position: { x: 0, y: 0, width: 100, height: 100 } },
        ],
      },
      isValid: true,
      validationErrors: [],
    },

    // Infographic slide
    {
      id: '10',
      index: 9,
      content: {
        title: 'Company Overview',
        subtitle: 'At a Glance',
        bullets: [],
        layout: 'infographic',
        infographic: [
          { type: 'header', content: 'Our Journey', position: { x: 0, y: 0, width: 100, height: 50 }, style: { color: '#1f2937', fontSize: 24, fontWeight: 'bold' } },
          { type: 'stat', content: 'Founded in 2020', position: { x: 0, y: 60, width: 100, height: 30 }, style: { color: '#3b82f6', fontSize: 18 } },
          { type: 'stat', content: '50+ Employees', position: { x: 0, y: 100, width: 100, height: 30 }, style: { color: '#10b981', fontSize: 18 } },
          { type: 'stat', content: '$10M Revenue', position: { x: 0, y: 140, width: 100, height: 30 }, style: { color: '#f59e0b', fontSize: 18 } },
        ],
      },
      isValid: true,
      validationErrors: [],
    },
  ];

  const presentation: Presentation = {
    id: 'test-new-layouts',
    title: 'New Layouts Demo',
    slides,
    isValid: true,
    validationErrors: [],
    theme: {
      name: 'modern',
      colors: {
        primary: '#2563eb',
        secondary: '#7c3aed',
        accent: '#10b981',
        background: '#ffffff',
        text: '#1f2937',
        textLight: '#6b7280',
      },
      fonts: {
        title: 'Inter',
        body: 'Inter',
        accent: 'Inter',
      },
      layout: {
        width: 1920,
        height: 1080,
        padding: {
          top: 40,
          left: 40,
          right: 40,
          bottom: 40,
        },
      },
    },
    metadata: {
      author: 'Slide Harness',
      topic: 'New Layouts Demo',
      aspectRatio: '16:9',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      language: 'en',
      totalSlides: 10,
    },
  };

  // Export to PPTX
  const exporter = new SlideExporter();
  const outputPath = './output/new-layouts-demo.pptx';

  try {
    await exporter.exportPPTX(presentation, outputPath);
    console.log('✅ PPTX exported successfully!');
    console.log(`📁 File: ${outputPath}`);
    console.log('\n📊 Layouts included:');
    console.log('  ✓ timeline');
    console.log('  ✓ stats');
    console.log('  ✓ faq');
    console.log('  ✓ pricing');
    console.log('  ✓ testimonial');
    console.log('  ✓ code');
    console.log('  ✓ flowchart');
    console.log('  ✓ video');
    console.log('  ✓ image-grid');
    console.log('  ✓ infographic');
    console.log('\n🎯 Open the PPTX file to see all new layouts rendered!');
  } catch (error) {
    console.error('❌ Export failed:', error);
  }
}

// Run test
testNewLayouts().catch(console.error);