import Softphone from './core/Softphone';
import * as Exceptions from './exceptions';
import { registerGlobals } from 'react-native-webrtc';

registerGlobals();

export {
  Softphone,
  Exceptions
};