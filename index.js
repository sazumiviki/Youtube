import express from 'express';
import ytsr from 'ytsr';
import cheerio from 'cheerio';

const fetch = import('node-fetch');

const app = express();
const port = 3000;

const post = async (url, form, headers = {}) => {
    const fetchModule = await fetch;
    return fetchModule.default(url, {
        method: 'POST',
        body: new URLSearchParams(form),
        headers
    });
};

const youtube = {
    regex: /(?:http(?:s|):\/\/|)(?:(?:www\.|)?youtube(?:\-nocookie|)\.com\/(?:shorts\/)?(?:watch\?.*(?:|\&)v=|embed\/|live\/|v\/)?|youtu\.be\/)([-_0-9A-Za-z]{11})/,

    async search(query) {
        if (youtube.regex.test(query)) query = `https://youtube.com/watch?v=${query.match(youtube.regex)[1]}`;
        let html = await (await fetch(`https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`)).text();
        let json = JSON.parse(html.split('ytInitialData = ')[1].split(';</script>')[0]);
        let videos = json.contents.twoColumnSearchResultsRenderer.primaryContents.sectionListRenderer.contents[0].itemSectionRenderer.contents;
        return videos.map((vid) => vid.videoRenderer).filter(Boolean);
    },

    async download(url) {
        let json = await (await post('https://yt1s.ltd/mates/en/analyze/ajax?retry=undefined', { url, k_org: url, q_auto: 0, ajax: 1, lang: 'en' })).json();
        if (json.status !== 'success') throw 'Can\'t convert video';

        let $ = cheerio.load(json.result);
        let id = $('input[type="hidden"]').attr('data-id');
        let title = $('#video_title').text();
        let result = { video: {}, audio: {} };

        for (let type in result) {
            $(`#${type === 'video' ? 'mp4' : 'mp3'} tbody tr`).each((idx, el) => {
                let g = new URL($(el).find('a').attr('href'));
                let quality = g.searchParams.get('note');
                result[type][quality] = {
                    quality,
                    fileSizeH: $(el).find('td').eq(1).text().split('M')[0] + ' MB',
                    fileSize: +(g.searchParams.get('totalSize') / 1024),
                    download: async () => {
                        let respConv = await post(`https://nearbypro.www-2048.com/mates/en/convert?id=${id}&retry=null`, {
                            url, title, id,
                            note: quality,
                            platform: 'youtube',
                            ext: g.searchParams.get('ext'),
                            format: g.searchParams.get('format')
                        });
                        if (!/json/.test(respConv.headers.get('content-type'))) throw await respConv.text();

                        let jsonConvert = await respConv.json();
                        if (jsonConvert.status !== 'success') throw jsonConvert;
                        return jsonConvert.downloadUrlX;
                    }
                };
            });
        }

        return {
            id, title,
            thumbnail: `https://i.ytimg.com/vi/${id}/0.jpg`,
            duration: $('.m-b-0.m-t').text().split(': ')[1],
            video: result.video,
            audio: result.audio
        };
    }
};

app.get('/api/youtube', async (req, res) => {
    const query = req.query.q;
    const contentType = req.query.type;

    if (!query || !contentType) {
        const formattedResponse = { error: 'Missing query parameters (q or type).' };
        res.setHeader('Content-Type', 'application/json');
        res.send(JSON.stringify(formattedResponse, null, 2));
        return;
    }

    try {
        const searchResult = await ytsr(query, { limit: 1 });
        const firstVideo = searchResult.items[0];

        if (contentType === 'video' || contentType === 'audio') {
            let videoInfo = await youtube.download(firstVideo.url);
            const formattedResponse = {
                title: firstVideo.title,
                thumbnail: firstVideo.bestThumbnail.url,
                views: firstVideo.views,
                [contentType]: await formatDownloadLinks(videoInfo[contentType], firstVideo.title, firstVideo.bestThumbnail.url, firstVideo.views)
            };
            res.setHeader('Content-Type', 'application/json');
            res.send(JSON.stringify(formattedResponse, null, 2));
        } else {
            const formattedResponse = { error: 'Invalid content type. Supported types: video, audio.' };
            res.setHeader('Content-Type', 'application/json');
            res.status(400).send(JSON.stringify(formattedResponse, null, 2));
        }
    } catch (error) {
        console.error('Error:', error);
        const formattedResponse = { error: 'Internal server error.' };
        res.setHeader('Content-Type', 'application/json');
        res.status(500).send(JSON.stringify(formattedResponse, null, 2));
    }
});

async function formatDownloadLinks(info, title, thumbnail, views) {
    const formattedLinks = {};

    const downloadPromises = Object.keys(info).map(async (quality) => {
        const downloadLink = await info[quality].download();
        return {
            quality: info[quality].quality,
            fileSizeH: info[quality].fileSizeH,
            fileSize: info[quality].fileSize,
            download: downloadLink
        };
    });

    const downloadResults = await Promise.all(downloadPromises);

    downloadResults.forEach((result, index) => {
        const quality = Object.keys(info)[index];
        formattedLinks[quality] = result;
    });

    return {
        title,
        thumbnail,
        views,
        downloadLinks: formattedLinks
    };
}

app.listen(port, () => {
    console.log(`Server is running at http://localhost:${port}`);
});
