<?php
namespace PoracleJS\PoracleJS\Telegram\Command\Member;

use Doctrine\DBAL\Configuration;
use Doctrine\DBAL\Connection;
use Doctrine\DBAL\DriverManager;
use Doctrine\DBAL\ParameterType;
use Symfony\Component\Console\Command\Command;
use Symfony\Component\Console\Input\InputArgument;
use Symfony\Component\Console\Input\InputInterface;
use Symfony\Component\Console\Output\OutputInterface;
use TelegramBot\Api\BotApi;
use TelegramBot\Api\HttpException;
use TelegramBot\Api\Types\ChatMember;

class CheckCommand extends Command
{
    /**
     * @var BotApi[]
     */
    private $bots;

    /**
     * @var Connection
     */
    private $connection;

    /**
     * @var string
     */
    private $channel;

    public function __construct(string $name = null, BotApi $bot = null, Connection $connection = null)
    {
        parent::__construct($name);

        if ($bot instanceof BotApi) {
            $this->bots[] = $bot;
        }

        if ($connection === null) {
            $config = new Configuration();
            $params = [
                'dbname' => getenv('DB_DATABASE'),
                'driver' => 'mysqli',
                'host' => getenv('DB_HOST'),
                'password' => getenv('DB_PASSWORD'),
                'port' => getenv('DB_PORT'),
                'user' => getenv('DB_USER'),
            ];
            $connection = DriverManager::getConnection($params, $config);
        }
        $this->connection = $connection;
    }

    protected function configure()
    {
        $this->setName('Telegram:Member:Check')
            ->setDescription('Checks all known humans having access to the registration channel')
            ->addArgument('token', InputArgument::OPTIONAL, 'Telegram bot token')
            ->addArgument('channel', InputArgument::OPTIONAL, 'Channel id');
    }

    protected function execute(InputInterface $input, OutputInterface $output)
    {
        $tokens = $input->getArgument('token');
        $tokens = $tokens ? explode(',', $tokens) : json_decode((getenv('TLG_TOKEN') ?? ''), true);
        $tokens = array_filter(array_map('trim', $tokens));
        if (empty($tokens)) {
            $output->write('<error>No Telegram token could be found</error>');

            return;
        }

        $this->channel = $input->getArgument('channel') ?: getenv('TLG_REGISTER');
        if (empty($this->channel)) {
            throw new \RuntimeException('No channel id could be found', 1575982460);
        }

        foreach ((array)$tokens as $token) {
            $this->bots[] = new BotApi($token);
        }

        $queryBuilder = $this->connection->createQueryBuilder();
        $statement = $queryBuilder->select('id', 'name')
            ->from('humans')
            ->where('enabled = 1')
            ->execute();

        while ($human = $statement->fetch()) {
            foreach ($this->bots as $bot) {
                try {
                    $user = $bot->getChatMember($this->channel, $human['id']);
                    if ($user instanceof ChatMember) {
                        $output->writeln('<info>User "' . $human['name'] . '" found in channel</info>');
                        continue 2;
                    }
                } catch (HttpException $exception) {
                    // Intentional fall through
                }
            }

            $updateQueryBuilder = $this->connection->createQueryBuilder();
            $updateQueryBuilder->update('humans')
                ->set('enabled', 0)
                ->where('id = ' . $updateQueryBuilder->createNamedParameter($human['id'], ParameterType::STRING))
                ->execute();
            $output->writeln('<error>User "' . $human['name'] . '" removed from channel</error>');
        }
    }
}
