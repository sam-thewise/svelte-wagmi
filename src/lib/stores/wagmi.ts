import { writable, get } from 'svelte/store';
import {
	createConfig,
	getAccount,
	disconnect,
	watchAccount,
	reconnect,
	type CreateConnectorFn,
	type GetAccountReturnType,
	type Config,
	http
} from '@wagmi/core';
//import { mainnet, polygon, optimism, arbitrum, type Chain } from '@wagmi/core/chains';
import { createAppKit, type AppKit, type Metadata } from '@reown/appkit';
import { WagmiAdapter} from '@reown/appkit-adapter-wagmi';
import {mainnet, polygon, optimism, arbitrum, avalanche, type Chain} from '@reown/appkit/networks';
export const connected = writable<boolean>(false);
export const wagmiLoaded = writable<boolean>(false);
export const chainId = writable<number | null | undefined>(null);
export const signerAddress = writable<string | null>(null);
export const configuredConnectors = writable<CreateConnectorFn[]>([]);
export const loading = writable<boolean>(true);
export const web3Modal = writable<AppKit>();
export const wagmiConfig = writable<Config>();
export const wagmiAdapter = writable<WagmiAdapter>();
type DefaultConfigProps = {
	appName: string;
	appIcon?: string | null;
	appDescription?: string | null;
	appUrl?: string | null;
	autoConnect?: boolean;
	alchemyId?: string | null;
	chains?: Chain[] | null;
	connectors: CreateConnectorFn[];
	walletConnectProjectId: string;
	metadata?: Metadata;
};
const defaultChains = [mainnet, polygon, optimism, arbitrum, avalanche];

export const defaultConfig = ({
	autoConnect = true,
	chains = defaultChains,
	alchemyId,
	connectors,
	walletConnectProjectId,
	metadata
}: DefaultConfigProps) => {
	if (connectors) configuredConnectors.set(connectors);

	//add email connector
	configuredConnectors.update((connectors) => [...connectors]);

	const url = alchemyId ? http(`https://eth-mainnet.g.alchemy.com/v2/${alchemyId}`) : http();

	const wagmiAdapt = new WagmiAdapter({
		networks: [mainnet, arbitrum, polygon, optimism],
		projectId: walletConnectProjectId
	})
	
	wagmiAdapter.set(wagmiAdapt);

	wagmiConfig.set(wagmiAdapt.wagmiConfig);

	if (autoConnect) reconnect(wagmiAdapt.wagmiConfig);
	const modal = createAppKit({
		adapters: [wagmiAdapt],
		projectId: walletConnectProjectId,
		networks: [mainnet, arbitrum, optimism, polygon],
		metadata
	});


	web3Modal.set(modal);
	wagmiLoaded.set(true);

	return { init };
};

export const init = async () => {
	try {
		setupListeners();
		const account = await waitForConnection();
		if (account.address) {
			const chain = get(wagmiConfig).chains.find((chain) => chain.id === account.chainId);
			if (chain) chainId.set(chain.id);
			connected.set(true);
			signerAddress.set(account.address);
		}
		loading.set(false);
	} catch (err) {
		loading.set(false);
	}
};

const setupListeners = () => {
	watchAccount(get(wagmiConfig), {
		onChange(data) {
			handleAccountChange(data);
		}
	});
};

const handleAccountChange = (data: GetAccountReturnType) => {
	// Wrap the original async logic in an immediately invoked function expression (IIFE)
	return (async () => {
		if (get(wagmiLoaded) && data.address) {
			const chain = get(wagmiConfig).chains.find((chain) => chain.id === data.chainId);

			if (chain) chainId.set(chain.id);
			connected.set(true);
			loading.set(false);
			signerAddress.set(data.address);
		} else if (data.isDisconnected && get(connected)) {
			loading.set(false);
			await disconnectWagmi(); // Handle async operation inside
		}
	})();
};

export const WC = async () => {
	try {
		get(web3Modal).open();
		await waitForAccount();

		return { succcess: true };
	} catch (err) {
		return { success: false };
	}
};

export const disconnectWagmi = async () => {
	await disconnect(get(wagmiConfig));
	connected.set(false);
	chainId.set(null);
	signerAddress.set(null);
	loading.set(false);
};

const waitForAccount = () => {
	return new Promise((resolve, reject) => {
		const unsub1 = get(web3Modal).subscribeEvents((newState) => {
			if (newState.data.event === 'MODAL_CLOSE') {
				reject('modal closed');
				unsub1();
			}
		});
		const unsub = watchAccount(get(wagmiConfig), {
			onChange(data) {
				if (data?.isConnected) {
					// Gottem, resolve the promise w/user's selected & connected Acc.
					resolve(data);
					unsub();
				} else {
					console.warn('🔃 - No Account Connected Yet...');
				}
			}
		});
	});
};

const waitForConnection = (): Promise<GetAccountReturnType> =>
	new Promise((resolve, reject) => {
		const attemptToGetAccount = () => {
			const account = getAccount(get(wagmiConfig));
			if (account.isDisconnected) reject('account is disconnected');
			if (account.isConnecting) {
				setTimeout(attemptToGetAccount, 250);
			} else {
				resolve(account);
			}
		};

		attemptToGetAccount();
	});