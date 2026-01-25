import React from 'react';
import Link from '@docusaurus/Link';
import { FaReact, FaVuejs } from 'react-icons/fa';
import { SiNextdotjs, SiExpress } from 'react-icons/si';

interface FrameworkItemProps {
    name: string;
    description: string;
    link: string;
    icon: React.ReactNode;
    color: string;
}

const FrameworkItem = ({ name, description, link, icon, color }: FrameworkItemProps) => {
    return (
        <div className="framework-item-col">
            <Link className="framework-link" to={link}>
                <div className="framework-icon-box" style={{ color }}>
                    {icon}
                </div>
                <div className="framework-details">
                    <div className="framework-name">{name}</div>
                    <div className="framework-desc">{description}</div>
                </div>
            </Link>
        </div>
    );
};

export const FrameworkList = () => {
    const frameworks = [
        {
            name: 'Next.js',
            description: 'App Router and Pages Router support.',
            link: './nextjs',
            icon: <SiNextdotjs />,
            color: '#ffffff',
        },
        {
            name: 'Node/Express.js',
            description: 'Complete backend server integration.',
            link: './node-express',
            icon: <SiExpress />,
            color: '#000000',
        },
        {
            name: 'React Hook',
            description: 'Native useMcp hook for React apps.',
            link: './react',
            icon: <FaReact />,
            color: '#61DAFB',
        },
        {
            name: 'Vue.js',
            description: 'Built-in composable for Vue 3 apps.',
            link: './vue',
            icon: <FaVuejs />,
            color: '#4FC08D',
        },
    ];

    return (
        <div className="framework-grid">
            {frameworks.map((fw) => (
                <FrameworkItem key={fw.name} {...fw} />
            ))}
        </div>
    );
};
