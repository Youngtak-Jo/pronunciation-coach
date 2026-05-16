'use client';

/**
 * 2D mouth-shape avatar — swaps the pre-placed Azure 22-viseme images
 * (SPEC §2, §9: "아바타는 2D 입모양 이미지 전환").
 */
import { useEffect } from 'react';
import { motion } from 'framer-motion';
import { getVisemeImagePath } from '@/lib/viseme';
import { cn } from '@/lib/utils';

interface VisemeAvatarProps {
  visemeId: number;
  size?: number;
  speaking?: boolean;
  className?: string;
}

let preloaded = false;

export function VisemeAvatar({
  visemeId,
  size = 220,
  speaking = false,
  className,
}: VisemeAvatarProps) {
  // warm the browser cache for all 22 viseme images once
  useEffect(() => {
    if (preloaded) return;
    preloaded = true;
    for (let i = 0; i <= 21; i++) {
      const img = new Image();
      img.src = getVisemeImagePath(i);
    }
  }, []);

  return (
    <div
      className={cn(
        'relative flex items-center justify-center rounded-2xl border border-border bg-secondary/40 overflow-hidden',
        className,
      )}
      style={{ width: size, height: size }}
    >
      <motion.div
        className="absolute inset-0 rounded-2xl"
        animate={{
          boxShadow: speaking
            ? '0 0 0 2px hsl(var(--primary) / 0.6), inset 0 0 40px hsl(var(--primary) / 0.15)'
            : '0 0 0 1px hsl(var(--border)), inset 0 0 0px transparent',
        }}
        transition={{ duration: 0.25 }}
      />
      {/* keyed image so each viseme change gets a quick pop animation */}
      <motion.img
        key={visemeId}
        src={getVisemeImagePath(visemeId)}
        alt={`viseme ${visemeId}`}
        draggable={false}
        initial={{ opacity: 0.4, scale: 0.96 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.09, ease: 'easeOut' }}
        className="h-full w-full object-cover"
      />
      <div className="absolute bottom-2 right-2 rounded-md bg-black/55 px-1.5 py-0.5 text-[10px] font-mono text-primary/90">
        viseme {visemeId}
      </div>
    </div>
  );
}
