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
    FaHardDrive,
    FaBoxesStacked
} from 'react-icons/fa6';
import { SiRedis } from 'react-icons/si';
import { CiFileOn } from 'react-icons/ci';
import { PiMemoryThin } from 'react-icons/pi';
import { BiLogoPostgresql } from 'react-icons/bi';
import { GrDatabase } from 'react-icons/gr';

export type IconType =
    | 'database' | 'sync' | 'tools' | 'chart' | 'lock' | 'idea' | 'search' | 'book'
    | 'success' | 'warning' | 'error'
    | 'rocket' | 'bolt' | 'target' | 'filesystem' | 'memory' | 'redis' | 'postgres' | 'backends';

interface DocIconProps {
    type: IconType;
    size?: number;
    className?: string;
    style?: React.CSSProperties;
    color?: string;
}

const palette = {
    red: '#d82c20',    // Brand Red
    orange: '#f97316',
    amber: '#f59e0b',
    yellow: '#eab308',
    green: '#10b981',
    slate: '#64748b',
    neutral: '#4b5563',
    brandRedis: '#D82C20',
    brandPostgres: '#336791', // Still Postgres brand blue, but let's see
};

const iconMap: Record<IconType, { Icon: any, defaultColor: string }> = {
    database: { Icon: FaDatabase, defaultColor: palette.red },
    sync: { Icon: FaRotate, defaultColor: palette.green },
    tools: { Icon: FaWrench, defaultColor: palette.slate },
    chart: { Icon: FaChartBar, defaultColor: palette.amber },
    lock: { Icon: FaLock, defaultColor: palette.neutral },
    idea: { Icon: FaLightbulb, defaultColor: palette.yellow },
    search: { Icon: FaMagnifyingGlass, defaultColor: palette.slate },
    book: { Icon: FaBookOpen, defaultColor: palette.neutral },

    success: { Icon: FaCircleCheck, defaultColor: palette.green },
    warning: { Icon: FaTriangleExclamation, defaultColor: palette.amber },
    error: { Icon: FaCircleXmark, defaultColor: palette.red },

    rocket: { Icon: FaRocket, defaultColor: palette.red },
    bolt: { Icon: FaBolt, defaultColor: palette.yellow },
    target: { Icon: FaBullseye, defaultColor: palette.red },

    filesystem: { Icon: CiFileOn, defaultColor: palette.yellow },
    memory: { Icon: PiMemoryThin, defaultColor: palette.slate },
    redis: { Icon: SiRedis, defaultColor: palette.brandRedis },
    postgres: { Icon: BiLogoPostgresql, defaultColor: palette.brandPostgres },
    backends: { Icon: GrDatabase, defaultColor: palette.red },
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
