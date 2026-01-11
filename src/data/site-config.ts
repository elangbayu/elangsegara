import type { SiteConfig } from '../types';

const siteConfig: SiteConfig = {
    website: 'https://elangsegara.com',
    title: 'Elang Segara',
    subtitle: '// random order memory',
    description: 'Elang Segara personal website to write ideas and anything',
    headerNavLinks: [
        {
            text: 'Home',
            href: '/'
        },
        {
            text: 'Projects',
            href: '/projects'
        },
        {
            text: 'Blog',
            href: '/blog'
        },
        {
            text: 'Tags',
            href: '/tags'
        }
    ],
    footerNavLinks: [
        {
            text: 'About',
            href: '/about'
        },
        {
            text: 'Contact',
            href: '/contact'
        }
    ],
    socialLinks: [
        {
            text: 'GitHub',
            href: 'https://github.com/elangbayu'
        }
    ],
    hero: {
        title: 'Hi,',
        actions: [
            {
                text: 'Get in Touch',
                href: '/contact'
            }
        ]
    },
    postsPerPage: 8,
    projectsPerPage: 8
};

export default siteConfig;
