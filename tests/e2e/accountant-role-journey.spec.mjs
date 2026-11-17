import { roleJourney } from './role-journey-helper.mjs';

roleJourney({
  role: 'accountant',
  allowed: ["dashboard","billing","reports"],
  denied: ["patients","laboratory","surgeries"]
});
