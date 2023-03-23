
import {strToU8, zipSync} from 'fflate';
import FileSaver from 'file-saver';


/**
 * Finds all generated images. Usage:
 * findImages((img, p) => { console.log(p); console.log(img) });
 *
 * @param handler {function(Element, string|null)}
 */
function findImages(handler) {

    const containers = document.getElementsByClassName("image-prompt-overlay-container");
    for (let i = 0; i < containers.length; i++) {
        const container = containers[i];

        // find image
        let img = null;
        const generatedImageContainers = container.getElementsByClassName("generated-image");
        if (generatedImageContainers.length > 0) {
            const generatedImageContainer = generatedImageContainers[0];
            const image = generatedImageContainer.querySelector("img");
            if (image) {
                img = image;
            }
        }

        // find prompt
        let prompt = null;
        const imagePromptOverlays = container.getElementsByClassName("image-prompt-overlay");
        if (imagePromptOverlays.length > 0) {
            const imagePromptOverlay = imagePromptOverlays[0];
            const h2 = imagePromptOverlay.querySelector("h4");
            if (h2) {
                prompt = h2.textContent;
            }
        }

        if (!img) {
            console.log("Image not found in target container - there may be some changes in page structure");
        } else {
            handler(img, prompt);
        }
    }
}

function asData(img) {
    const canvas = document.createElement("canvas");
    canvas.width = 1024;
    canvas.height = 1024;
    const ctx = canvas.getContext("2d");
    ctx.drawImage(img, 0, 0);

    function dataURLtoBlob(dataurl) {
        let arr = dataurl.split(',');
        let bstr = atob(arr[1]);
        let n = bstr.length;
        let out = new Uint8Array(n);
        while (n--) {
            out[n] = bstr.charCodeAt(n);
        }
        return out;
    }

    let dataUrl = canvas.toDataURL('image/png');
    return dataURLtoBlob(dataUrl);
}

/**
 * Download all generated images.
 */
export function download() {
    let zipData = {};

    let i = 1;
    findImages((img, prompt) => {
        const id = String(i).padStart(3, '0');
        console.log(id + (prompt ? ' - ' + prompt : ''));

        zipData[id + '.png'] = asData(img);

        if (prompt) {
            zipData[id + '.txt'] = strToU8(prompt);
        }

        i++;
    });

    let bytes = zipSync(zipData, { level: 0 });
    FileSaver.saveAs(new Blob([bytes]), "images.zip");
}

download();
