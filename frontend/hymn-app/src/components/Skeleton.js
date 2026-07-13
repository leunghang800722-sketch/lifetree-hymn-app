import React from 'react';
import { View, Animated, StyleSheet } from 'react-native';

const Skeleton = ({ style }) => {
 const opacity = new Animated.Value(0.3);

 React.useEffect(() => {
 Animated.loop(
 Animated.sequence([
 Animated.timing(opacity, { toValue: 1, duration: 800, useNativeDriver: true }),
 Animated.timing(opacity, { toValue: 0.3, duration: 800, useNativeDriver: true }),
 ])
 ).start();
 }, []);

 return <Animated.View style={[style, { opacity }]} />;
};

export default Skeleton;
