import React, { useEffect, useRef } from 'react';
import { Animated } from 'react-native';

const Skeleton = ({ style }) => {
 const opacity = useRef(new Animated.Value(0.3)).current;

 useEffect(() => {
 Animated.loop(
 Animated.sequence([
 Animated.timing(opacity, { toValue: 1, duration: 800, useNativeDriver: true }),
 Animated.timing(opacity, { toValue: 0.3, duration: 800, useNativeDriver: true }),
 ])
 ).start();
 }, [opacity]);

 return <Animated.View style={[style, { opacity }]} />;
};

export default Skeleton;
