/**
 * UpgradeModalManager - Global 402 Error Handler
 * Phase 8.2 - Frontend 402 Error Handling
 *
 * Listens for 'show-upgrade-modal' custom events from API client
 * and displays the UpgradeModal when trial limits are reached
 */

import React, { useState, useEffect } from 'react';
import { UpgradeModal, UpgradeModalData } from './UpgradeModal';

export const UpgradeModalManager: React.FC = () => {
  const [modalOpen, setModalOpen] = useState(false);
  const [modalData, setModalData] = useState<UpgradeModalData | null>(null);

  useEffect(() => {
    // Listen for 402 error events from API client
    const handleUpgradeEvent = (event: Event) => {
      const customEvent = event as CustomEvent<UpgradeModalData>;

      if (customEvent.detail) {
        setModalData(customEvent.detail);
        setModalOpen(true);
      }
    };

    window.addEventListener('show-upgrade-modal', handleUpgradeEvent);

    return () => {
      window.removeEventListener('show-upgrade-modal', handleUpgradeEvent);
    };
  }, []);

  const handleClose = () => {
    setModalOpen(false);
    // Keep modal data for smooth close animation
    setTimeout(() => {
      setModalData(null);
    }, 300);
  };

  return <UpgradeModal open={modalOpen} onClose={handleClose} data={modalData} />;
};

export default UpgradeModalManager;
