/**
 * Quick DOM check for MCP Chat FAB button
 * Run this in browser console to diagnose why FAB isn't visible
 */

console.log('=== MCP Chat FAB Button Diagnostic ===');

// Check if FAB button exists in DOM
const fabButtons = document.querySelectorAll('button[class*="MuiFab"]');
console.log(`Found ${fabButtons.length} FAB buttons in DOM`);

if (fabButtons.length > 0) {
  fabButtons.forEach((fab, index) => {
    console.log(`\nFAB Button ${index + 1}:`);
    console.log('- Element:', fab);
    console.log('- Classes:', fab.className);
    console.log('- Computed styles:', {
      display: window.getComputedStyle(fab).display,
      visibility: window.getComputedStyle(fab).visibility,
      opacity: window.getComputedStyle(fab).opacity,
      position: window.getComputedStyle(fab).position,
      bottom: window.getComputedStyle(fab).bottom,
      right: window.getComputedStyle(fab).right,
      zIndex: window.getComputedStyle(fab).zIndex,
    });
    console.log('- Bounding rect:', fab.getBoundingClientRect());
    console.log('- Parent element:', fab.parentElement);
    console.log(
      '- Has SmartToy icon?',
      fab.innerHTML.includes('SmartToy') || fab.querySelector('svg') !== null
    );
  });
} else {
  console.log('\n❌ No FAB buttons found!');
  console.log('\nChecking for SmartToy icon anywhere in DOM...');
  const smartToyIcons = document.querySelectorAll(
    'svg[data-testid*="SmartToy"], [class*="SmartToy"]'
  );
  console.log(`Found ${smartToyIcons.length} SmartToy icons`);

  if (smartToyIcons.length > 0) {
    console.log(
      'SmartToy icon exists but not in a FAB button - checking parent hierarchy...'
    );
    smartToyIcons.forEach((icon) => {
      console.log(
        '- Icon parent chain:',
        icon.parentElement,
        icon.parentElement?.parentElement
      );
    });
  }
}

// Check if AdminDashboard is actually rendered
console.log('\n=== AdminDashboard Verification ===');
const adminHeader = document.querySelector('[data-testid="admin-card-users"]');
console.log('Admin dashboard card found?', adminHeader !== null);

// Check for any tooltip that might contain the FAB
const tooltips = document.querySelectorAll('[role="tooltip"]');
console.log(`\nFound ${tooltips.length} tooltips`);

// Check React root for debugging
console.log('\n=== React Component Check ===');
const mainElement = document.querySelector('[data-testid="dashboard-main"]');
if (mainElement) {
  console.log('Dashboard main element found');
  console.log('Children count:', mainElement.children.length);
  console.log('First child:', mainElement.children[0]);
} else {
  console.log('❌ Dashboard main element not found');
}

console.log('\n=== localStorage Check ===');
console.log('Selected role:', localStorage.getItem('ectropy_selected_role'));
console.log('User token exists?', localStorage.getItem('token') !== null);

console.log('\n=== Recommended Actions ===');
if (fabButtons.length === 0) {
  console.log('1. Check if AdminDashboard component is actually rendering');
  console.log('2. Check browser console for React errors');
  console.log(
    '3. Try hard refresh: Ctrl+Shift+R (Windows) or Cmd+Shift+R (Mac)'
  );
  console.log('4. Check if React is throwing errors during render');
}
