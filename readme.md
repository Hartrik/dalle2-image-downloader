# DALL·E 2 Batch Image Downloader
This little tool can download all images from [Dalle2](https://openai.com/product/dall-e-2) at once – as a ZIP file.
Prompts are also downloaded.
It is intended for power users because it utilizes browser dev tools.

1) Open your Dalle2 history or a collection
2) Scroll down to load all the images. Warning: prompts won't show up on small screen!
3) Open dev tools (F12)
4) Copy the contents of [dalle2-downloader.umd.js](dist/dalle2-downloader.umd.js) and paste it into the console
   * The assembled script includes a ZIP library (*fflate*) and a utility for file downloading (*file-saver*)
5) After pressing enter the process starts automatically
   * At the end, the ZIP file will start downloading
6) If needed, enter `Downloader.download();` to start it again


## Preview

![Sand Game JS preview](https://files.harag.cz/www/blog/2023-03-23_dalle2-downloader/img-step-1.png)

![Sand Game JS preview](https://files.harag.cz/www/blog/2023-03-23_dalle2-downloader/img-step-2.png)


## Development

`npm run build` builds the source code to `dist`.
