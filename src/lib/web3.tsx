import * as ethereumjsWallet from "ethereumjs-wallet";
import * as React from "react";

import Web3 from "web3";
import { List, OrderedMap } from "immutable";
import WalletSubprovider from "ethereumjs-wallet/provider-engine";
import ProviderEngine from "web3-provider-engine";
import FetchSubprovider from "web3-provider-engine/subproviders/fetch";
import NonceSubprovider from "web3-provider-engine/subproviders/nonce-tracker";
import BigNumber from "bignumber.js";

// import { Contract } from "web3/types";
import { Message, MessageType } from "../components/Faucet";
import { ReactComponent as DAI } from "../img/dai.svg";
import { ReactComponent as ETH } from "../img/eth.svg";
import { ReactComponent as REN } from "../img/ren.svg";

export enum Token {
    ETH = "ETH",
    REN = "REN",
    DAI = "DAI",
}

export interface TokenDetails {
    code: Token;
    digits: number;
    address: string;
    image: React.FunctionComponent<React.SVGProps<SVGSVGElement>>;
    getBalance: (web3: Web3, account: string, token: TokenDetails) => Promise<BigNumber>,
    transfer: (token: Token, web3: Web3, recipient: string, amount: string, addMessage: (msg: Message) => void, from: string) => Promise<void>,
}

const getETHBalance = async (web3: Web3, account: string, token: TokenDetails): Promise<BigNumber> => {
    return new BigNumber(await web3.eth.getBalance(account)).div(new BigNumber(10).pow(token.digits));
}

const getERC20Balance = async (web3: Web3, account: string, token: TokenDetails) => {
    const erc20 = await getERC20Contract(web3, token.address);
    return new BigNumber(await erc20.methods.balanceOf(account).call()).div(new BigNumber(10).pow(token.digits));
}


const standardTokenABI = require("./abi/StandardToken.json").abi;

export const getERC20Contract = (web3: Web3, address: string): any => new web3.eth.Contract(standardTokenABI, address);

const onTransactionHash = (addMessage: (msg: Message) => void, value: string, token: string) => (transactionHash: string) => {
    addMessage({
        type: MessageType.INFO,
        key: Token.ETH,
        message: <span>Sending {value} {token} (<a href={`https://kovan.etherscan.io/tx/${transactionHash}`}>Etherscan Link</a>)</span>,
    });
}

const onError = (addMessage: (msg: Message) => void, token: string) => (err: Error) => {
    console.error(err);
    if (err.message && err.message.match("newBlockHeaders ")) {
        return;
    }
    addMessage({
        type: MessageType.ERROR,
        key: token,
        message: <span>Error sending {token}: {err.message}</span>,
    });
}

const sendETH = async (token: Token, web3: Web3, recipient: string, amount: string, addMessage: (msg: Message) => void, from: string): Promise<void> => {
    try {
        const hash = await new Promise<string>((resolve, reject) => {
            web3.eth.sendTransaction({
                from,
                to: recipient,
                value: new BigNumber(amount).times(new BigNumber(10).exponentiatedBy(18)).toFixed(),
            })
                .on("transactionHash", resolve)
                .on("error", reject);
        });
        onTransactionHash(addMessage, amount, Token.ETH)(hash);
    } catch (error) {
        onError(addMessage, Token.ETH)(error);
    }
}

const sendERC20Token = async (token: Token, web3: Web3, recipient: string, amount: string, addMessage: (msg: Message) => void, from: string) => {
    const tokenDetails = TOKENS.get(token);
    try {
        const erc20 = await getERC20Contract(web3, tokenDetails.address);

        const value = new BigNumber(amount).multipliedBy(new BigNumber(10).pow(tokenDetails.digits));
        const hash = await new Promise<string>((resolve, reject) => {
            erc20.methods.transfer(recipient, value.toFixed()).send({
                from,
            })
                .on("transactionHash", resolve)
                .on("error", reject);
        });
        onTransactionHash(addMessage, amount, token)(hash);
    } catch (error) {
        onError(addMessage, token)(error);
    }
}

export const TOKENS = OrderedMap<string, TokenDetails>()
    .set(Token.ETH, { code: Token.ETH, digits: 18, address: "", image: ETH, getBalance: getETHBalance, transfer: sendETH, })
    .set(Token.REN, { code: Token.REN, digits: 18, address: "0x2CD647668494c1B15743AB283A0f980d90a87394", image: REN, getBalance: getERC20Balance, transfer: sendERC20Token })
    .set(Token.DAI, { code: Token.DAI, digits: 18, address: "0xc4375b7de8af5a38a93548eb8453a498222c4ff2", image: DAI, getBalance: getERC20Balance, transfer: sendERC20Token })
    ;

export const sendTokens = async (
    account: string, web3: Web3, token: Token,
    recipient: string, amount: string, addMessage: (msg: Message) => void
): Promise<void> => {
    await TOKENS.get(token).transfer(token, web3, recipient, amount, addMessage, account);
};

export const getWeb3 = (privateKey: string) => {
    const wallet = ethereumjsWallet.fromPrivateKey(new Buffer(privateKey, "hex"));

    const walletProvider = new WalletSubprovider(wallet, {});
    const engine = new ProviderEngine();
    engine.addProvider(walletProvider);
    engine.addProvider(new NonceSubprovider());
    engine.addProvider(new FetchSubprovider({ rpcUrl: process.env.REACT_APP_ETHEREUM_NODE }));
    engine.start();
    return new Web3(engine);
};
