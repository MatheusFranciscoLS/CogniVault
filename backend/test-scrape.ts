import { HusqvarnaScraperService } from './src/services/husqvarna-scraper.service';

async function test() {
    const data = await HusqvarnaScraperService.fetchLiveData('532431650');
    console.log(JSON.stringify(data, null, 2));
}

test();
