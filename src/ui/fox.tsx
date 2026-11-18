import { useEffect, useState } from 'react';
import { Animated, Easing, Image, Platform, View, type ViewStyle } from 'react-native';

export type FoxPose = 'idle' | 'happy' | 'wow' | 'think';

const IMAGES: Record<FoxPose, number> = {
  idle: require('../../assets/mascot/fox-idle.png'),
  happy: require('../../assets/mascot/fox-happy.png'),
  wow: require('../../assets/mascot/fox-wow.png'),
  think: require('../../assets/mascot/fox-think.png'),
};

const native = Platform.OS !== 'web';

/** Фенёк, талисман «Алифа»: покачивается и подпрыгивает, когда меняет позу */
export function Fox({ pose = 'idle', size = 150, style }: { pose?: FoxPose; size?: number; style?: ViewStyle }) {
  const [bob] = useState(() => new Animated.Value(0));
  const [pop] = useState(() => new Animated.Value(1));

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(bob, { toValue: 1, duration: 900, easing: Easing.inOut(Easing.sin), useNativeDriver: native }),
        Animated.timing(bob, { toValue: 0, duration: 900, easing: Easing.inOut(Easing.sin), useNativeDriver: native }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [bob]);

  useEffect(() => {
    pop.setValue(0);
    Animated.spring(pop, { toValue: 1, speed: 14, bounciness: 14, useNativeDriver: native }).start();
  }, [pose, pop]);

  const h = size * 1.18;
  return (
    <View style={[{ width: size, height: h }, style]} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Animated.View
        style={{
          width: size,
          height: h,
          transform: [
            { translateY: bob.interpolate({ inputRange: [0, 1], outputRange: [0, -6] }) },
            { translateY: pop.interpolate({ inputRange: [0, 1], outputRange: [-18, 0] }) },
            { scale: pop.interpolate({ inputRange: [0, 1], outputRange: [0.9, 1] }) },
          ],
        }}
      >
        <Image source={IMAGES[pose]} style={{ width: size, height: h }} resizeMode="contain" />
      </Animated.View>
    </View>
  );
}
