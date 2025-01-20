import { useCallback, useEffect, useState } from "react";
import { ethos, TransactionBlock } from "ethos-connect";
import { SuccessMessage } from ".";
import { ETHOS_EXAMPLE_CONTRACT } from "../lib/constants";
import { KioskClient, Network, KioskOwnerCap } from "@mysten/kiosk";
import { getFullnodeUrl, SuiClient } from "@mysten/sui/client";

const ROOTLET_TYPE =
  "0x8f74a7d632191e29956df3843404f22d27bd84d92cca1b1abde621d033098769::rootlet::Rootlet";

type NFT = {
  id: string;
  listing: unknown;
  owner: {
    kiosk_id: string;
    personal_kiosk_cap_id: string;
  };
};

const UnlockAndTransferRootlet = () => {
  const { wallet } = ethos.useWallet();
  const [rootletId, setRootletId] = useState<string | null>(null);

  const kioskClient = new KioskClient({
    network: Network.MAINNET,
    client: new SuiClient({
      url: getFullnodeUrl("mainnet"),
    }),
  });

  const unlockAndTransferRootlet = useCallback(async () => {
    if (!wallet) {
      console.log("No wallet connected");
      return;
    }

    try {
      let allKioskOwnerCaps: KioskOwnerCap[] = [];
      let hasNextPage = true;
      let cursor: string | null = null;

      while (hasNextPage) {
        const response = await kioskClient.getOwnedKiosks({
          address: wallet.address,
          pagination: {
            limit: 50,
            cursor: cursor ?? undefined,
          },
        });
        console.log("response", response);

        allKioskOwnerCaps = [...allKioskOwnerCaps, ...response.kioskOwnerCaps];

        if (response.hasNextPage && response.nextCursor) {
          cursor = response.nextCursor;
        } else {
          hasNextPage = false;
        }
      }

      const personalKiosks = allKioskOwnerCaps.filter(
        (kioskOwnerCap) => kioskOwnerCap.isPersonal === true
      );

      console.log("personalKiosks", personalKiosks);

      const kioskItems = [];
      for (const kioskOwnerCap of personalKiosks) {
        const kiosk = await kioskClient.getKiosk({
          id: kioskOwnerCap.kioskId.toString(),
          options: {
            withObjects: true,
          },
        });
        kioskItems.push({
          items: kiosk.items,
          kioskOwnerCap,
        });
      }

      // if it's a rootlet add cap id and kiosk id
      const nfts = [];
      for (const kioskData of kioskItems) {
        for (const obj of kioskData.items) {
          if (obj.type === ROOTLET_TYPE) {
            const nft: NFT = {
              id: obj.objectId,
              listing: obj.listing,
              owner: {
                kiosk_id: obj.kioskId,
                personal_kiosk_cap_id: kioskData.kioskOwnerCap.objectId,
              },
            };
            nfts.push(nft);
          }
        }
      }

      console.log("nfts", nfts);

      const unlockTransactionBlock = new TransactionBlock();

      for (const nft of nfts) {
        const thisNft = nft;
        if (thisNft.id == rootletId) {
          const personal_kiosk_package_id = kioskClient.getRulePackageId(
            "personalKioskRulePackageId"
          );

          const [kioskOwnerCap, perosnalBorrow] =
            unlockTransactionBlock.moveCall({
              target: `${personal_kiosk_package_id}::personal_kiosk::borrow_val`,
              arguments: [
                unlockTransactionBlock.object(
                  thisNft.owner.personal_kiosk_cap_id
                ),
              ],
            });

          const [nft, nftBorrow] = unlockTransactionBlock.moveCall({
            target: `0x2::kiosk::borrow_val`,
            arguments: [
              unlockTransactionBlock.object(thisNft.owner.kiosk_id),
              kioskOwnerCap,
              unlockTransactionBlock.pure(thisNft.id),
            ],
            typeArguments: [ROOTLET_TYPE],
          });

          unlockTransactionBlock.transferObjects(
            [nft],
            unlockTransactionBlock.pure(
              "0xb0e24ba1afc3d2f5e348b569e72e94cf20ec2cecf3cd27edea1c3ad628e5374c",
              "address"
            )
          );

          unlockTransactionBlock.moveCall({
            target: `0x2::kiosk::return_val`,
            arguments: [
              unlockTransactionBlock.object(thisNft.owner.kiosk_id),
              nft,
              nftBorrow,
            ],
            typeArguments: [ROOTLET_TYPE],
          });

          unlockTransactionBlock.moveCall({
            target: `${personal_kiosk_package_id}::personal_kiosk::return_val`,
            arguments: [
              unlockTransactionBlock.object(
                thisNft.owner.personal_kiosk_cap_id
              ),
              kioskOwnerCap,
              perosnalBorrow,
            ],
          });
        }

        await wallet.signAndExecuteTransactionBlock({
          transactionBlock: unlockTransactionBlock,
          options: {
            showObjectChanges: true,
          },
        });
      }
    } catch (error) {
      console.log(error);
    }
  }, [wallet]);

  const reset = useCallback(() => {
    setRootletId(null);
  }, []);

  useEffect(() => {
    reset();
  }, [reset]);

  return (
    <div className="flex flex-col gap-6">
      {rootletId && (
        <SuccessMessage reset={reset}>
          <a
            href={`https://explorer.sui.io/objects/${rootletId}?network=testnet`}
            target="_blank"
            rel="noreferrer"
            className="underline font-blue-600"
          >
            View Your NFT on the TestNet Explorer
          </a>
        </SuccessMessage>
      )}
      <button
        className="mx-auto px-5 py-3 border border-transparent text-base font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700"
        onClick={unlockAndTransferRootlet}
      >
        Unlock and Transfer Rootlet
      </button>
    </div>
  );
};

export default UnlockAndTransferRootlet;
