import React from 'react';
import {
    FaDatabase,
    FaRotate,
    FaWrench,
    FaChartBar,
    FaLock,
    FaLightbulb,
    FaMagnifyingGlass,
    FaBookOpen,
    FaCircleCheck,
    FaTriangleExclamation,
    FaCircleXmark,
    FaRocket,
    FaBolt,
    FaBullseye,
    FaHardDrive
} from 'react-icons/fa6';
import { MdMemory } from 'react-icons/md';

export type IconType =
    | 'database' | 'sync' | 'tools' | 'chart' | 'lock' | 'idea' | 'search' | 'book'
    | 'success' | 'warning' | 'error'
    | 'rocket' | 'bolt' | 'target' | 'filesystem' | 'memory';

interface DocIconProps {
    type: IconType;
    size?: number;
    className?: string;
    style?: React.CSSProperties;
    color?: string;
}

const iconMap: Record<IconType, { Icon: any, defaultColor: string }> = {
    database: { Icon: FaDatabase, defaultColor: '#3b82f6' },
    sync: { Icon: FaRotate, defaultColor: '#10b981' },
    tools: { Icon: FaWrench, defaultColor: '#6366f1' },
    chart: { Icon: FaChartBar, defaultColor: '#f59e0b' },
    lock: { Icon: FaLock, defaultColor: '#ec4899' },
    idea: { Icon: FaLightbulb, defaultColor: '#eab308' },
    search: { Icon: FaMagnifyingGlass, defaultColor: '#64748b' },
    book: { Icon: FaBookOpen, defaultColor: '#8b5cf6' },

    success: { Icon: FaCircleCheck, defaultColor: '#10b981' },
    warning: { Icon: FaTriangleExclamation, defaultColor: '#f59e0b' },
    error: { Icon: FaCircleXmark, defaultColor: '#ef4444' },

    rocket: { Icon: FaRocket, defaultColor: '#ef4444' },
    bolt: { Icon: FaBolt, defaultColor: '#eab308' },
    target: { Icon: FaBullseye, defaultColor: '#3b82f6' },

    filesystem: { Icon: FaHardDrive, defaultColor: '#4b5563' },
    memory: { Icon: MdMemory, defaultColor: '#06b6d4' },
};

export const DocIcon = ({ type, size = 20, className, style, color }: DocIconProps) => {
    const config = iconMap[type];
    if (!config) return null;

    const { Icon, defaultColor } = config;

    return (
        <Icon
            size={size}
            className={className}
            style={{
                color: color || defaultColor,
                display: 'inline-block',
                verticalAlign: 'middle',
                marginRight: '8px',
                ...style
            }}
        />
    );
};
