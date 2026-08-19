// Debe ser el primer import: el paquete "uuid" (usado en offlineStore.ts
// para generar eventId) necesita crypto.getRandomValues, que no existe en
// el runtime de Hermes/React Native sin este polyfill.
import 'react-native-get-random-values';

import { registerRootComponent } from 'expo';

import App from './App';

// registerRootComponent calls AppRegistry.registerComponent('main', () => App);
// It also ensures that whether you load the app in Expo Go or in a native build,
// the environment is set up appropriately
registerRootComponent(App);
