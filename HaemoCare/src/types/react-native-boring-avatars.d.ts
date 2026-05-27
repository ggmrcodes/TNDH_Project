// react-native-boring-avatars ships a "types" field pointing at a file that
// isn't published, so TS can't resolve it. Declare the (small, stable) public
// API here. Mirrors the package's own AvatarProps.
declare module 'react-native-boring-avatars' {
  import type { ComponentType } from 'react';

  export interface AvatarProps {
    size?: number | string;
    name?: string;
    square?: boolean;
    variant?: 'beam' | 'sunset' | 'bauhaus' | 'pixel' | 'ring';
    colors?: string[];
  }

  const Avatar: ComponentType<AvatarProps>;
  export default Avatar;
}
