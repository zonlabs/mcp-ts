import React from 'react';
import clsx from 'clsx';
import Link from '@docusaurus/Link';
import { FaReact, FaVuejs } from 'react-icons/fa';
import { SiNextdotjs, SiExpress } from 'react-icons/si';

interface FrameworkCardProps {
    name: string;
    description: string;
    link: string;
    icon: React.ReactNode;
    color: string;
}

const FrameworkCard = ({ name, description, link, icon, color }: FrameworkCardProps) => {
    return (
        <div className="col col--4 margin-bottom--lg">
            <Link className="framework-card" to={link} style={{ borderTopColor: color }}>
                <div className="framework-card-icon" style={{ color }}>
                    {icon}
                </div>
                <div className="framework-card-info">
                    <h3>{name}</h3>
                    <p>{description}</p>
                </div>
            </Link>
        </div>
    );
};

export const FrameworkCards = () => {
    const frameworks = [
        {
            name: 'Next.js',
            description: 'App Router and Pages Router integration.',
            link: './nextjs',
            icon: <SiNextdotjs />,
            color: '#ffffff',
        },
        {
            name: 'Node/Express.js',
            description: 'Backend integration for Node.js apps.',
            link: './node-express',
            icon: <SiExpress />,
            color: '#000000',
        },
        {
            name: 'React Hook',
            description: 'Standard useMcp hook for React apps.',
            link: './react',
            icon: <FaReact />,
            color: '#61DAFB',
        },
        {
            name: 'Vue.js',
            description: 'Built-in composable for Vue 3.',
            link: './vue',
            icon: <FaVuejs />,
            color: '#4FC08D',
        },
    ];

    return (
        <div className="row framework-cards-container">
            {frameworks.map((fw) => (
                <FrameworkCard key={fw.name} {...fw} />
            ))}
        </div>
    );
};
