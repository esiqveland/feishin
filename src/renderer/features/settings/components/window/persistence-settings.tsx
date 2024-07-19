import { useTranslation } from 'react-i18next';
import { Switch, toast } from '/@/renderer/components';
import { useCallback, useEffect, useState } from 'react';
import {
    SettingOption,
    SettingsSection,
} from '/@/renderer/features/settings/components/settings-section';
import { useCurrentServer } from '/@/renderer/store';
import {
    checkPersistence,
    initPersistence,
    PersistenceState,
    PersistenceStats,
} from '/@/renderer/features/persistence/persistence';
import { formatSizeString } from '/@/renderer/utils';

export const PersistenceSettings = () => {
    const { t } = useTranslation();
    const currentServer = useCurrentServer();
    const [isRequesting, setIsRequesting] = useState(false);
    const [persistenceState, setPersistenceState] = useState<PersistenceState | 'loading'>(
        'loading',
    );
    const [persistenceStats, setPersistenceStats] = useState<PersistenceStats | undefined>();

    useEffect(() => {
        let isMounted = true;

        async function check() {
            const state = await checkPersistence();
            if (!isMounted) {
                return;
            }
            setPersistenceState(state);
            if (state === 'access-granted') {
                const res = await initPersistence(currentServer!);
                if (res.result === 'success') {
                    const stats = await res.store.stats();
                    setPersistenceStats(stats);
                }
            }
        }

        check();
        return () => {
            isMounted = false;
        };
    }, [setPersistenceState, setPersistenceStats, currentServer]);

    const requestPersistence = useCallback(async () => {
        if (!currentServer) {
            return;
        }
        setIsRequesting(true);
        try {
            const res = await initPersistence(currentServer);
            switch (res.result) {
                case 'permission-denied':
                    console.log('Persistence: permission-denied');
                    toast.error({ message: 'Persistence: permission-denied' });
                    setPersistenceState('no-access');
                    break;
                case 'unsupported':
                    console.log('Persistence: unsupported');
                    toast.error({ message: 'Persistence: unsupported' });
                    setPersistenceState('unsupported');
                    break;
                case 'success': {
                    toast.success({
                        // message: t('setting.clearCacheSuccess', { postProcess: 'sentenceCase' }),
                        message: 'Persistence: success',
                    });
                    setPersistenceState('access-granted');
                    const stats = await res.store.stats();
                    setPersistenceStats(stats);
                    break;
                }
            }
        } catch (error) {
            console.error(error);
            toast.error({ message: (error as Error).message });
        } finally {
            setIsRequesting(false);
        }
    }, [currentServer, setIsRequesting, setPersistenceStats]);

    const defaultEnabled = persistenceState === 'access-granted';

    const options: SettingOption[] = [
        {
            control: (
                <Switch
                    checked={defaultEnabled}
                    // defaultChecked={defaultEnabled}
                    disabled={isRequesting || !currentServer || persistenceState === 'unsupported'}
                    onChange={(e) => {
                        if (!e) {
                            return;
                        }
                        if (e.currentTarget.checked) {
                            requestPersistence();
                        }
                    }}
                >
                    {t('common.clear', { postProcess: 'sentenceCase' })}
                </Switch>
            ),
            description: 'Request access to data persistence.',
            isHidden: !currentServer,
            title: 'Enable persistence for offline access to music',
        },
    ];
    if (persistenceStats) {
        const percentage = (persistenceStats.usageBytes / persistenceStats.quotaBytes) * 100;
        options.push({
            control: '',
            description: `Current Usage: ${percentage.toFixed(1)} of ${formatSizeString(
                persistenceStats.quotaBytes,
            )}`,
            title: 'Persistence storage usage',
        });
    }

    return (
        <SettingsSection
            divider
            options={options}
        />
    );
};
