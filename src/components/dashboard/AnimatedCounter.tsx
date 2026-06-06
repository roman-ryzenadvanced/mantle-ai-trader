'use client';

import { useEffect, useState } from 'react';
import { useMotionValue, useSpring } from 'framer-motion';
import { cn } from '@/lib/utils';

interface AnimatedCounterProps {
  value: number;
  prefix?: string;
  suffix?: string;
  decimals?: number;
  className?: string;
}

export function AnimatedCounter({
  value,
  prefix = '',
  suffix = '',
  decimals = 2,
  className,
}: AnimatedCounterProps) {
  const motionValue = useMotionValue(0);
  const springValue = useSpring(motionValue, { damping: 30, stiffness: 100 });
  const [displayValue, setDisplayValue] = useState('0');

  useEffect(() => {
    motionValue.set(value);
  }, [motionValue, value]);

  useEffect(() => {
    const unsubscribe = springValue.on('change', (latest) => {
      const formatted = latest.toLocaleString('en-US', {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals,
      });
      setDisplayValue(formatted);
    });
    return unsubscribe;
  }, [springValue, decimals]);

  return (
    <span className={cn('tabular-nums', className)}>
      {prefix}
      {displayValue}
      {suffix}
    </span>
  );
}
