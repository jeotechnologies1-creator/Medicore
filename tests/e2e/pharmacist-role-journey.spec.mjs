import { roleJourney } from './role-journey-helper.mjs';

roleJourney({
  role: 'pharmacist',
  allowed: ["dashboard","pharmacy","inventory","prescriptions"],
  denied: ["records","surgeries","billing"]
});
