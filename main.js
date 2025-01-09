import WebSocket from 'ws';
import axios from 'axios';
import { randomUUID } from 'crypto';
import { HttpsProxyAgent } from 'https-proxy-agent';
import { SocksProxyAgent } from 'socks-proxy-agent';
import fs from 'fs';
import log from './utils/logger.js';
import bedduSalama from './utils/banner.js';

const headers = {
    "Accept": "application/json, text/plain, */*",
    "Accept-Encoding": "gzip, deflate, br, zstd",
    "Accept-Language": "en-US,en;q=0.9,id;q=0.8",
    "Origin": "https://app.mygate.network",
    "Priority": "u=1, i",
    "Referer": "https://app.mygate.network/",
    "Sec-CH-UA": '"Google Chrome";v="131", "Chromium";v="131", "Not_A Brand";v="24"',
    "Sec-CH-UA-Mobile": "?0",
    "Sec-CH-UA-Platform": '"Windows"',
    "Sec-Fetch-Dest": "empty",
    "Sec-Fetch-Mode": "cors",
    "Sec-Fetch-Site": "same-site",
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"
};

function readFile(pathFile) {
    try {
        const datas = fs.readFileSync(pathFile, 'utf8')
            .split('\n')
            .map(data => data.trim())
            .filter(data => data.length > 0);
        return datas;
    } catch (error) {
        log.error(`Error reading file: ${error.message}`);
        return [];
    }
};

const newAgent = (proxy = null) => {
    if (proxy && proxy.startsWith('http://')) {
        const agent = new HttpsProxyAgent(proxy);
        return agent;
    } else if (proxy && proxy.startsWith('socks4://')) {
        const agent = new SocksProxyAgent(proxy);
        return agent;
    } else if (proxy && proxy.startsWith('socks5://')) {
        const agent = new SocksProxyAgent(proxy);
        return agent;
    } else {
        return null;
    }
};

class WebSocketClient {
    constructor(token, proxy = null, uuid, reconnectInterval = 5000) {
        this.token = token;
        this.proxy = proxy;
        this.socket = null;
        this.reconnectInterval = reconnectInterval;
        this.shouldReconnect = true;
        this.agent = newAgent(proxy)
        this.uuid = uuid;
        this.url = `wss://api.mygate.network/socket.io/?nodeId=${this.uuid}&EIO=4&transport=websocket`;
        this.regNode = `40{ "token":"Bearer ${this.token}"}`;
    }

    connect() {
        if (!this.uuid || !this.url) {
            log.error("Cannot connect: Node is not registered.");
            return;
        }

        log.info(`Connecting to node: ${this.uuid}`, '', true);
        this.socket = new WebSocket(this.url, { agent: this.agent });

        this.socket.onopen = async () => {
            log.success(`Node connected`, this.uuid);
            await new Promise(resolve => setTimeout(resolve, 3000));
            this.reply(this.regNode);
        };

        this.socket.onmessage = (event) => {
            if (event.data === "2" || event.data === "41") {
                this.socket.send("3");
            } else {
                log.debug(`Node message`, `${this.uuid}: ${event.data}`);
            }
        };

        this.socket.onclose = () => {
            log.warn(`Node disconnected`, this.uuid);
            if (this.shouldReconnect) {
                log.info(`Reconnecting node in ${this.reconnectInterval / 1000}s`, this.uuid);
                setTimeout(() => this.connect(), this.reconnectInterval);
            }
        };

        this.socket.onerror = (error) => {
            log.error(`WebSocket error: ${this.uuid}`, error.message);
            this.socket.close();
        };
    }

    reply(message) {
        if (this.socket && this.socket.readyState === WebSocket.OPEN) {
            this.socket.send(String(message));
            log.debug("Node reply", message);
        } else {
            log.error("Cannot send message; WebSocket is not open.");
        }
    }

    disconnect() {
        this.shouldReconnect = true;
        if (this.socket) {
            this.socket.close();
        }
    }
}

async function registerNode(token, proxy = null) {
    const agent = newAgent(proxy)
    const maxRetries = 5;
    let retries = 0;
    const uuid = randomUUID();
    const activationDate = new Date().toISOString();
    const payload = {
        id: uuid,
        status: "Good",
        activationDate: activationDate,
    };

    log.info("Registering new node", '', true);
    while (retries < maxRetries) {
        try {
            const response = await axios.post(
                "https://api.mygate.network/api/front/nodes",
                payload,
                {
                    headers: {
                        ...headers,
                        "Authorization": `Bearer ${token}`,
                    },
                    agent: agent,
                }
            );

            log.success("Node registration successful", uuid);
            return uuid;
        } catch (error) {
            retries++;
            if (retries < maxRetries) {
                log.warn(`Registration attempt ${retries}/${maxRetries} failed, retrying...`);
                await new Promise(resolve => setTimeout(resolve, 10000));
            } else {
                log.error("Node registration failed", error.message);
                return null;
            }
        }
    }
}

async function confirmUser(token, proxy = null) {
    const agent = newAgent(proxy)
    try {
        log.info("Confirming user referral", '', true);
        await axios.post(
            "https://api.mygate.network/api/front/referrals/referral/LfBWAQ?",
            {},
            {
                headers: {
                    ...headers,
                    "Authorization": `Bearer ${token}`,
                },
                agent: agent,
            }
        );
        log.success("User referral confirmed");
    } catch (error) {
        log.error("Referral confirmation failed", error.message);
    }
};

const getQuestsList = async (token, proxy = null) => {
    const maxRetries = 5;
    let retries = 0;
    const agent = newAgent(proxy)

    log.info("Fetching quests list", '', true);
    while (retries < maxRetries) {
        try {
            const response = await axios.get("https://api.mygate.network/api/front/achievements/ambassador", {
                headers: {
                    ...headers,
                    "Authorization": `Bearer ${token}`,
                },
                agent: agent,
            });
            const uncompletedIds = response.data.data.items
                .filter(item => item.status === "UNCOMPLETED")
                .map(item => item._id);
            log.success("Quests fetched", `${uncompletedIds.length} uncompleted`);
            return uncompletedIds;
        } catch (error) {
            retries++;
            if (retries < maxRetries) {
                log.warn(`Fetch attempt ${retries}/${maxRetries} failed, retrying...`);
                await new Promise(resolve => setTimeout(resolve, 10000));
            } else {
                log.error("Failed to fetch quests", error.message);
                return { error: error.message };
            }
        }
    }
};

async function submitQuest(token, proxy = null, questId) {
    const maxRetries = 5;
    let retries = 0;
    const agent = newAgent(proxy)

    log.info(`Submitting quest: ${questId}`, '', true);
    while (retries < maxRetries) {
        try {
            await axios.post(
                `https://api.mygate.network/api/front/achievements/ambassador/${questId}/submit?`,
                {},
                {
                    headers: {
                        ...headers,
                        "Authorization": `Bearer ${token}`,
                    },
                    agent: agent,
                }
            );
            log.success("Quest submitted", questId);
            return true;
        } catch (error) {
            retries++;
            if (retries < maxRetries) {
                log.warn(`Submit attempt ${retries}/${maxRetries} failed, retrying...`);
                await new Promise(resolve => setTimeout(resolve, 10000));
            } else {
                log.error("Quest submission failed", error.message);
                return false;
            }
        }
    }
};

async function getUserInfo(token, proxy = null) {
    const maxRetries = 5;
    let retries = 0;
    const agent = newAgent(proxy)

    log.info("Fetching user info", '', true);
    while (retries < maxRetries) {
        try {
            const response = await axios.get("https://api.mygate.network/api/front/users/me", {
                headers: {
                    ...headers,
                    "Authorization": `Bearer ${token}`,
                },
                agent: agent,
            });
            const { name, status, _id, levels, currentPoint } = response.data.data;
            log.success("User info fetched", { name, status, _id, level: levels[0].name, points: currentPoint });
            return { name, status, _id, levels, currentPoint };
        } catch (error) {
            retries++;
            if (retries < maxRetries) {
                log.warn(`Fetch attempt ${retries}/${maxRetries} failed, retrying...`);
                await new Promise(resolve => setTimeout(resolve, 10000));
            } else {
                log.error("Failed to fetch user info", error.message);
                return { error: error.message };
            }
        }
    }
};

async function getUserNode(token, proxy = null) {
    const maxRetries = 5;
    let retries = 0;
    const agent = newAgent(proxy)

    log.info("Fetching user nodes", '', true);
    while (retries < maxRetries) {
        try {
            const response = await axios.get(
                "https://api.mygate.network/api/front/nodes?limit=10&page=1",
                {
                    headers: {
                        ...headers,
                        "Authorization": `Bearer ${token}`,
                    },
                    agent: agent,
                }
            );
            const nodes = response.data.data.items.map(item => item.id);
            log.success("Nodes fetched", `${nodes.length} active nodes`);
            return nodes;
        } catch (error) {
            retries++;
            if (retries < maxRetries) {
                log.warn(`Fetch attempt ${retries}/${maxRetries} failed, retrying...`);
                await new Promise(resolve => setTimeout(resolve, 10000));
            } else {
                log.error("Failed to fetch nodes", error.message);
                return [];
            }
        }
    }
};

const checkQuests = async (token, proxy = null) => {
    const questsIds = await getQuestsList(token, proxy);

    if (questsIds && questsIds.length > 0) {
        log.info(`Processing ${questsIds.length} uncompleted quests`);
        for (const questId of questsIds) {
            await submitQuest(token, proxy, questId);
        }
    }
};

async function main() {
    console.clear();
    console.log(bedduSalama);

    const tokens = readFile("tokens.txt");
    const proxies = readFile("proxy.txt");
    let proxyIndex = 0;

    log.info(`Starting MyGate Network Bot`, `${tokens.length} accounts loaded`);

    try {
        for (let i = 0; i < tokens.length; i++) {
            const token = tokens[i];
            const proxy = proxies.length > 0 ? proxies[proxyIndex] : null;
            if (proxies.length > 0) {
                proxyIndex = (proxyIndex + 1) % proxies.length;
            }

            log.info(`Processing account #${i + 1}`, proxy ? `Using proxy: ${proxy}` : 'No proxy');
            
            let nodes = await getUserNode(token, proxy);
            if (!nodes || nodes.length === 0) {
                const uuid = await registerNode(token, proxy);
                if (!uuid) continue;
                nodes = [uuid];
            }

            await confirmUser(token, proxy);
            await getUserInfo(token, proxy);

            for (const node of nodes) {
                const client = new WebSocketClient(token, proxy, node);
                client.connect();

                setInterval(() => {
                    client.disconnect();
                }, 10 * 60 * 1000);
            }

            await checkQuests(token, proxy);
            
            // Schedule periodic tasks
            setInterval(async () => {
                await getUserInfo(token, proxy);
            }, 15 * 60 * 1000);

            setInterval(async () => {
                await checkQuests(token, proxy);
            }, 24 * 60 * 60 * 1000);
        }
        
        log.success("Bot initialization complete", "All accounts are running");
    } catch (error) {
        log.error("Fatal error occurred", error.message);
    }
};

main();
