import { roleJourney } from './role-journey-helper.mjs';

roleJourney({
  role: 'receptionist',
  allowed: ["dashboard","patients","appointments"],
  denied: ["billing","records","surgeries"]
});
